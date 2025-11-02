#![allow(unexpected_cfgs, deprecated)]

use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;


declare_id!("2HX5VSpAT1ug6v4XM7qBdf9Zmu5J1VhhnUGXdvZnVZuR");

#[program]
pub mod anchor_escrow {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, deposit: u64, receive: u64) -> Result<()> {
        ctx.accounts.init_escrow(seed, receive, &ctx.bumps)?;
        ctx.accounts.deposit(deposit)?;
        Ok(())
    }

    pub fn take(ctx: Context<Take>,) -> Result<()> {
        let escrow =&ctx.accounts.escrow;
        ctx.accounts.deposit(escrow.receive)?;
        ctx.accounts.withdraw_and_close_vault()?;

        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        ctx.accounts.refund_and_close()?;

        Ok(())
    }
}