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
        seeds = [b"open_orders", market.key().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub open_orders: Account<'info, OpenOrders>,

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
    pub fn place_order(&mut self, is_bid: bool, price: u64, size: u64) -> Result<()> {
        let clock = Clock::get()?;
        let order_id = clock.unix_timestamp as u128;

        if self.open_orders.owner == Pubkey::default() {
            self.open_orders.owner = self.signer.key();
            self.open_orders.market = self.market.key();
            self.open_orders.base_free = 0;
            self.open_orders.base_locked = 0;
            self.open_orders.quote_free = 0;
            self.open_orders.quote_locked = 0;
        }

        let required_amount = if is_bid {
            price.checked_mul(size).ok_or(ErrorCode::MathOverflow)?
        } else {
            size
        };
        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = if is_bid {
            Transfer {
                authority: self.signer.to_account_info(),
                from: self.user_quote_vault.to_account_info(),
                to: self.quote_vault.to_account_info(),
            }
        } else {
            Transfer {
                authority: self.signer.to_account_info(),
                from: self.user_base_vault.to_account_info(),
                to: self.base_vault.to_account_info(),
            }
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        transfer(cpi_ctx, required_amount)?;

        if is_bid {
            self.open_orders.quote_locked = self
                .open_orders
                .quote_locked
                .checked_add(required_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        } else {
            self.open_orders.base_locked = self
                .open_orders
                .base_locked
                .checked_add(required_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        let mut remaining_size = size;

        if is_bid {
            let asks = &mut self.asks;
            let mut i = 0;

            while i < asks.orders.len() && remaining_size > 0 {
                let ask_orders = &asks.orders[i];

                if price >= ask_orders.price {
                    let match_size = remaining_size.min(ask_orders.size);
                    let match_value = ask_orders
                        .price
                        .checked_mul(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    self.open_orders.quote_locked = self
                        .open_orders
                        .quote_locked
                        .checked_sub(match_value)
                        .ok_or(ErrorCode::InsufficientFunds)?;
                    self.open_orders.base_free = self
                        .open_orders
                        .base_free
                        .checked_add(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    remaining_size = remaining_size
                        .checked_sub(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    if match_size >= ask_orders.size {
                        asks.orders.remove(i);
                    } else {
                        asks.orders[i].size = asks.orders[i]
                            .size
                            .checked_sub(match_size)
                            .ok_or(ErrorCode::MathOverflow)?;
                        i = i.checked_add(1).unwrap_or(usize::MAX);
                    }
                } else {
                    break;
                }
            }
        } else {
            let bids = &mut self.bids;
            let mut i = 0;

            while i < bids.orders.len() && remaining_size > 0 {
                let bid_orders = &bids.orders[i];

                if price <= bid_orders.price {
                    let match_size = remaining_size.min(bid_orders.size);
                    let match_value = bid_orders
                        .price
                        .checked_mul(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    self.open_orders.base_locked = self
                        .open_orders
                        .base_locked
                        .checked_sub(match_size)
                        .ok_or(ErrorCode::InsufficientFunds)?;

                    self.open_orders.quote_free = self
                        .open_orders
                        .quote_free
                        .checked_add(match_value)
                        .ok_or(ErrorCode::MathOverflow)?;

                    remaining_size = remaining_size
                        .checked_sub(match_size)
                        .ok_or(ErrorCode::MathOverflow)?;

                    if match_size >= bid_orders.size {
                        bids.orders.remove(i);
                    } else {
                        bids.orders[i].size = bids.orders[i]
                            .size
                            .checked_sub(match_size)
                            .ok_or(ErrorCode::MathOverflow)?;
                        i = i.checked_add(1).unwrap_or(usize::MAX);
                    }
                } else {
                    break;
                }
            }
        }

        if remaining_size > 0 {
            let new_order = Order {
                order_id,
                owner: self.signer.key(),
                price,
                size: remaining_size,
                timestamp: clock.unix_timestamp,
            };

            if is_bid {
                let bids = &mut self.bids;

                let insert_pos = bids
                    .orders
                    .iter()
                    .position(|o| {
                        o.price < price || (o.price == price && o.timestamp > clock.unix_timestamp)
                    })
                    .unwrap_or(bids.orders.len());
                bids.orders.insert(insert_pos, new_order);
            } else {
                let asks = &mut self.asks;
                let insert_pos = asks
                    .orders
                    .iter()
                    .position(|o| {
                        o.price > price || (o.price == price && o.timestamp > clock.unix_timestamp)
                    })
                    .unwrap_or(asks.orders.len());
                asks.orders.insert(insert_pos, new_order);
            }
        }

        Ok(())
    }
}
