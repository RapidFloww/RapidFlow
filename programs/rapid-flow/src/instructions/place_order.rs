#![allow(warnings)]
use std::env::var;

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{error::ErrorCode, *};

#[derive(Accounts)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.base_mint.key().as_ref(), market.quote_mint.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"bids", market.key().as_ref()],
        bump
    )]
    pub bids: Account<'info, OrderBook>,

    #[account(
        mut,
        seeds = [b"asks", market.key().as_ref()],
        bump
    )]
    pub asks: Account<'info, OrderBook>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + OpenOrders::INIT_SPACE,
        seeds = [b"user_open_orders", market.key().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub user_open_orders: Account<'info, OpenOrders>,

    #[account(
        mut,
        associated_token::mint = market.base_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub base_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = market.quote_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = market.base_mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program
    )]
    pub user_base_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = market.quote_mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program
    )]
    pub user_quote_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> PlaceOrder<'info> {
    pub fn place_order(
        &mut self,
        is_bid: bool,
        price: u64,
        mut size: u64,
        remaining_accounts: &'info [AccountInfo<'info>],
    ) -> Result<()> {
        let clock = Clock::get()?;

        if self.user_open_orders.owner == Pubkey::default() {
            self.user_open_orders.owner = self.signer.key();
            self.user_open_orders.market = self.market.key();
            self.user_open_orders.base_free = 0;
            self.user_open_orders.base_locked = 0;
            self.user_open_orders.quote_free = 0;
            self.user_open_orders.quote_locked = 0;
        }

        // Matching logic FIRST (before locking funds)
        if is_bid {
            // Buy order: match against asks (sellers)
            let asks = &mut self.asks;
            let mut i = 0;

            while i < asks.orders.len() && size > 0 {
                let ask_order = &mut asks.orders[i];
                
                // Only match if price is acceptable
                if price < ask_order.price {
                    i += 1;
                    continue;
                }

                // Find the matching counter-party account from remaining_accounts
                let mut counter_user_account_opt = None;
                for account in remaining_accounts.iter() {
                    if let Ok(counter_open_orders) = Account::<OpenOrders>::try_from(account) {
                        if counter_open_orders.owner == ask_order.owner {
                            counter_user_account_opt = Some(account);
                            break;
                        }
                    }
                }

                // If we found the matching account, process the match
                if let Some(counter_user_account) = counter_user_account_opt {
                    require!(
                        counter_user_account.is_writable,
                        ErrorCode::InsufficientFunds
                    );

                    let mut counter_user_open_orders: Account<OpenOrders> =
                        Account::try_from(counter_user_account)?;

                    // Calculate match size (take minimum of what's available)
                    let match_size = core::cmp::min(size, ask_order.size);
                    let match_quote_amount = ask_order.price
                        .checked_mul(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // Update taker (buyer) balances - they get base tokens
                    self.user_open_orders.base_free = self
                        .user_open_orders
                        .base_free
                        .checked_add(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // Update maker (seller) balances
                    counter_user_open_orders.base_locked = counter_user_open_orders
                        .base_locked
                        .checked_sub(match_size)
                        .ok_or(ErrorCode::InsufficientFunds)?;
                    counter_user_open_orders.quote_free = counter_user_open_orders
                        .quote_free
                        .checked_add(match_quote_amount)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // Extract struct clone (to release RefCell borrow)
                    let counter_user_data = (*counter_user_open_orders).clone();
                    drop(counter_user_open_orders);

                    // Re-borrow and serialize
                    counter_user_data
                        .try_serialize(&mut *counter_user_account.data.borrow_mut())?;

                    // Update order size and remove if fully filled
                    ask_order.size = ask_order.size
                        .checked_sub(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;
                    size = size
                        .checked_sub(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    if ask_order.size == 0 {
                        asks.orders.remove(i);
                    } else {
                        i += 1;
                    }
                } else {
                    // No matching account found, skip this order
                    i += 1;
                }
            }

            // Lock funds and add to book ONLY for remaining unfilled size
            if size > 0 {
                let amount = price
                    .checked_mul(size)
                    .ok_or(ErrorCode::MathOverflow)?;

                let cpi_accounts = Transfer {
                    authority: self.signer.to_account_info(),
                    from: self.user_quote_vault.to_account_info(),
                    to: self.quote_vault.to_account_info(),
                };
                let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
                transfer(cpi_ctx, amount)?;

                self.user_open_orders.quote_locked = self
                    .user_open_orders
                    .quote_locked
                    .checked_add(amount)
                    .ok_or(ErrorCode::MathOverflow)?;

                self.bids.orders.push(Order {
                    order_id: clock.unix_timestamp as u128,
                    owner: self.signer.key(),
                    price,
                    size,
                    timestamp: clock.unix_timestamp,
                });
            }
        } else {
            // Sell order: match against bids (buyers)
            let bids = &mut self.bids;
            let mut i = 0;

            while i < bids.orders.len() && size > 0 {
                let bid_order = &mut bids.orders[i];
                
                // Only match if price is acceptable
                if price > bid_order.price {
                    i += 1;
                    continue;
                }

                // Find the matching counter-party account from remaining_accounts
                let mut counter_user_account_opt = None;
                for account in remaining_accounts.iter() {
                    if let Ok(counter_open_orders) = Account::<OpenOrders>::try_from(account) {
                        if counter_open_orders.owner == bid_order.owner {
                            counter_user_account_opt = Some(account);
                            break;
                        }
                    }
                }

                // If we found the matching account, process the match
                if let Some(counter_user_account) = counter_user_account_opt {
                    require!(
                        counter_user_account.is_writable,
                        ErrorCode::InsufficientFunds
                    );

                    let mut counter_user_open_orders: Account<OpenOrders> =
                        Account::try_from(counter_user_account)?;

                    // Calculate match size
                    let match_size = core::cmp::min(size, bid_order.size);
                    let match_quote_amount = bid_order.price
                        .checked_mul(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // Update taker (seller) balances - they get quote tokens
                    self.user_open_orders.quote_free = self
                        .user_open_orders
                        .quote_free
                        .checked_add(match_quote_amount)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // Update maker (buyer) balances
                    counter_user_open_orders.quote_locked = counter_user_open_orders
                        .quote_locked
                        .checked_sub(match_quote_amount)
                        .ok_or(ErrorCode::InsufficientFunds)?;
                    counter_user_open_orders.base_free = counter_user_open_orders
                        .base_free
                        .checked_add(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // Extract struct clone (to release RefCell borrow)
                    let counter_user_data = (*counter_user_open_orders).clone();
                    drop(counter_user_open_orders);

                    // Re-borrow and serialize
                    counter_user_data
                        .try_serialize(&mut *counter_user_account.data.borrow_mut())?;

                    // Update order size and remove if fully filled
                    bid_order.size = bid_order.size
                        .checked_sub(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;
                    size = size
                        .checked_sub(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    if bid_order.size == 0 {
                        bids.orders.remove(i);
                    } else {
                        i += 1;
                    }
                } else {
                    // No matching account found, skip this order
                    i += 1;
                }
            }

            // Lock funds and add to book ONLY for remaining unfilled size
            if size > 0 {
                let cpi_accounts = Transfer {
                    authority: self.signer.to_account_info(),
                    from: self.user_base_vault.to_account_info(),
                    to: self.base_vault.to_account_info(),
                };
                let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
                transfer(cpi_ctx, size)?;

                self.user_open_orders.base_locked = self
                    .user_open_orders
                    .base_locked
                    .checked_add(size)
                    .ok_or(ErrorCode::MathOverflow)?;

                self.asks.orders.push(Order {
                    order_id: clock.unix_timestamp as u128,
                    owner: self.signer.key(),
                    price,
                    size,
                    timestamp: clock.unix_timestamp,
                });
            }
        }

        Ok(())
    }
}