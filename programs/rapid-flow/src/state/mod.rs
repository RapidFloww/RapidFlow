use anchor_lang::prelude::*;

#[account]
pub struct OrderBook {
    // book
    pub market: Pubkey,
    pub is_bid: bool,
    pub orders: Vec<Order>,
    pub bump: u8,
}

#[account]
pub struct Order {
    // single order
    pub order_id: u128,
    pub owner: Pubkey,
    pub price: u64,
    pub size: u64,
    pub timestamp: i64,
}

#[account]
#[derive(InitSpace)]
pub struct OpenOrders {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub base_free: u64,
    pub base_locked: u64,
    pub quote_free: u64,
    pub quote_locked: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub authority: Pubkey,
    pub base_mint: Pubkey,  // sol
    pub quote_mint: Pubkey, // usdc
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,
    pub bids: Pubkey, // orderbook
    pub asks: Pubkey, // orderbook
    pub bump: u8,
}
