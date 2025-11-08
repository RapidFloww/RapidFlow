use anchor_lang::prelude::*;
pub mod error;
pub mod instructions;
pub use instructions::*;

declare_id!("5hZHJEeFN45bz4xYu1A2RHwtfapTHiq1j8yroVnvjPtQ");

pub mod state;
pub use state::*;

#[program]
pub mod rapid_flow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.initialize()?;
        Ok(())
    }

    pub fn place_order<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, PlaceOrder<'c>>,
        is_bid: bool,
        price: u64,
        size: u64,
    ) -> Result<()> {
        ctx.accounts
            .place_order(is_bid, price, size, ctx.remaining_accounts)?;
        Ok(())
    }

    pub fn settle_funds(ctx: Context<SettleFunds>, is_base: bool, amount: u64) -> Result<()> {
        ctx.accounts.settle_funds(is_base, amount)?;
        Ok(())
    }

    // pub fn cancel_order(ctx: Context<CancelOrder>, order_id: u128, is_bid: bool) -> Result<()> {
    //     ctx.accounts.cancel_order(order_id, is_bid)
    // }
}
