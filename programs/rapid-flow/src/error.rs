#![allow(warnings)]
use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Order not found")]
    OrderNotFound,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("No funds to settle")]
    NoFundsToSettle,
    #[msg("Invalid claim amount")]
    InvalidClaimAmount,
    #[msg("Insufficient balance to claim")]
    InsufficientBalanceClaim,
}
