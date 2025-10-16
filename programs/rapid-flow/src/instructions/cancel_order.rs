#![allow(warnings)]
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Token, TokenAccount, Transfer},
};

use crate::{error::ErrorCode, *};

#[derive(Accounts)]
pub struct CancelOrder<'info> {
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
        mut,
        seeds = [b"open_orders", market.key().as_ref(), signer.key().as_ref()],
        bump,
        constraint = open_orders.owner == signer.key() @ ErrorCode::UnauthorizedAccess
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

impl<'info> CancelOrder<'info> {
    // Select the side of the orderbook to search (bids or asks)
    pub fn cancel_order(&mut self, order_id: u128, is_bid: bool) -> Result<()> {
        // ==========================================================
        // SECTION 1: Select the correct orderbook side (BID or ASK)
        // ==========================================================
        let order_book = if is_bid {
            &mut self.bids
        } else {
            &mut self.asks
        };

        // ==========================================================
        // SECTION 2: Locate the user's order to cancel
        // ==========================================================
        // - Find the index of the order matching the given order_id.
        // - Ensure the signer owns the order (prevents unauthorized cancellation).
        // - If not found, throw OrderNotFound error.
        let order_index = order_book
            .orders
            .iter()
            .position(|o| o.order_id == order_id && o.owner == self.signer.key())
            .ok_or(ErrorCode::OrderNotFound)?;

        // Remove the order from the orderbook and keep it for refund calculation
        let order = order_book.orders.remove(order_index);

        // ==========================================================
        // SECTION 3: Compute refund amount based on order side
        // ==========================================================
        // - For BID (buy): locked asset = quote → refund = price * size
        // - For ASK (sell): locked asset = base → refund = size
        let refund_amount = if is_bid {
            order
                .price
                .checked_mul(order.size)
                .ok_or(ErrorCode::MathOverflow)?
        } else {
            order.size
        };

        // ==========================================================
        // SECTION 4: Prepare market PDA signer seeds
        // ==========================================================
        // - Derive PDA seeds from base_mint, quote_mint, and bump.
        // - Market PDA signs the CPI transfer as authority.
        let market_key = self.market.key();

        let seeds = &[
            b"market",
            self.market.base_mint.as_ref(),
            self.market.quote_mint.as_ref(),
            &[self.market.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // ==========================================================
        // SECTION 5: Perform CPI transfer (refund user)
        // ==========================================================
        // - Transfers tokens from the market vault back to user's vault.
        // - BID → refund quote tokens.
        // - ASK → refund base tokens.
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = if is_bid {
            // refund quote tokens
            Transfer {
                authority: self.market.to_account_info(),
                from: self.quote_vault.to_account_info(),
                to: self.user_quote_vault.to_account_info(),
            }
        } else {
            // refund base tokens
            Transfer {
                authority: self.market.to_account_info(),
                from: self.base_vault.to_account_info(),
                to: self.user_base_vault.to_account_info(),
            }
        };

        // Execute the CPI with the market PDA as signer
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        transfer(cpi_ctx, refund_amount)?;

        // ==========================================================
        // SECTION 6: Update user's locked balances in OpenOrders
        // ==========================================================
        // - Deduct refunded amount from respective locked balance.
        // - Prevents double-withdrawal or incorrect accounting.
        if is_bid {
            self.open_orders.quote_locked = self
                .open_orders
                .quote_locked
                .checked_sub(refund_amount)
                .ok_or(ErrorCode::InsufficientFunds)?;
        } else {
            self.open_orders.base_locked = self
                .open_orders
                .base_locked
                .checked_sub(refund_amount)
                .ok_or(ErrorCode::InsufficientFunds)?;
        }

        // ==========================================================
        // SECTION 7: Finalization
        // ==========================================================
        // - Order has been successfully removed and funds refunded.
        // - All balances updated; state remains consistent.

        Ok(())
    }
}
