#![allow(warnings)]
use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::*;

#[allow(overflowing_literals)]
pub const MAX_ORDERS: usize = 128;
pub const ORDER_BOOK_SPACE: usize = 8 + 32 + 1 + 4 + (MAX_ORDERS * 72);
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    pub base_mint: Account<'info, Mint>,  // sol
    pub quote_mint: Account<'info, Mint>, // usdc

    #[account(
        init,
        payer = signer,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>, // sol-usdc

    #[account(
        init,
        payer = signer,
        space = ORDER_BOOK_SPACE,
        seeds = [b"bids", market.key().as_ref()],
        bump
    )]
    pub bids: Account<'info, OrderBook>,

    #[account(
        init,
        payer = signer,
        space = ORDER_BOOK_SPACE,
        seeds = [b"asks", market.key().as_ref()],
        bump
    )]
    pub asks: Account<'info, OrderBook>,

    #[account(
        init,
        payer = signer,
        associated_token::mint = base_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub base_vault: Account<'info, TokenAccount>, // sol

    #[account(
        init,
        payer = signer,
        associated_token::mint = quote_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub quote_vault: Account<'info, TokenAccount>, // usdc

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Initialize<'info> {
    pub fn initialize(&mut self, bumps: &InitializeBumps) -> Result<()> {
        // SECTION 1: Initialize the Market Account
        self.market.set_inner(Market {
            authority: self.signer.key(),
            base_mint: self.base_mint.key(),
            quote_mint: self.quote_mint.key(),
            base_vault: self.base_vault.key(),
            quote_vault: self.quote_vault.key(),
            bids: self.bids.key(),
            asks: self.asks.key(),
            bump: bumps.market,
        });

        // SECTION 2: Initialize the Bids OrderBook
        self.bids.set_inner(OrderBook {
            market: self.market.key(),
            is_bid: true,
            orders: Vec::new(),
            bump: bumps.bids,
        });

        // SECTION 3: Initialize the Asks OrderBook
        self.asks.set_inner(OrderBook {
            market: self.market.key(),
            is_bid: false,
            orders: Vec::new(),
            bump: bumps.asks,
        });

        Ok(())
    }
}
