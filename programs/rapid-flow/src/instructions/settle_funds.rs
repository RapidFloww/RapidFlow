use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Token, TokenAccount, Transfer},
};

use crate::{error::ErrorCode, *};

#[derive(Accounts)]
pub struct SettleFunds<'info> {
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

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> SettleFunds<'info> {
    pub fn settle_funds(&mut self) -> Result<()> {
        let base_free = self.open_orders.base_free;
        let quote_free = self.open_orders.quote_free;

        require!(base_free > 0 || quote_free > 0, ErrorCode::NoFundsToSettle);

        let market_key = self.market.key();
        let seeds = &[
            b"market",
            self.market.base_mint.as_ref(),
            self.market.quote_mint.as_ref(),
            &[self.market.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_program = self.token_program.to_account_info();

        if base_free > 0 {
            let cpi_accounts = Transfer {
                authority: self.market.to_account_info(),
                from: self.base_vault.to_account_info(),
                to: self.user_base_vault.to_account_info(),
            };
            let cpi_ctx =
                CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts, signer_seeds);
            transfer(cpi_ctx, base_free)?;

            self.open_orders.base_free = 0;
        }

        if quote_free > 0 {
            let cpi_accounts = Transfer {
                authority: self.market.to_account_info(),
                from: self.quote_vault.to_account_info(),
                to: self.user_quote_vault.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            transfer(cpi_ctx, quote_free)?;

            self.open_orders.quote_free = 0;
        }

        Ok(())
    }
}
