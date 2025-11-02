#![allow(deprecated,deadcode)]

// Import necessary libraries and types from Anchor, Solana, and SPL Token
import * as anchor from "@coral-xyz/anchor";
import { Program ,BN} from "@coral-xyz/anchor";
//import { TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";
import { AnchorEscrow } from "../target/types/anchor_escrow";
import {
  Keypair, 
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import {
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  // TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { randomBytes } from "crypto";

// Start the test suite
describe("anchor-escrow", () => {
  // Set up Anchor to use the local Solana cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  // Get the provider and connection objects
  const provider = anchor.getProvider();
  const connection = provider.connection;

  // Get the program and its ID
  const program = anchor.workspace.AnchorEscrow as Program<AnchorEscrow>;
  const programId = program.programId;
  const tokenProgram = TOKEN_2022_PROGRAM_ID;

  // Helper function to confirm a transaction
  const confirm = async (signature: string): Promise<string> => {
    const block = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...block,
    });
    return signature;
  };

  // Helper function to log a transaction signature with a link to the explorer
  const log = async (signature: string): Promise<string> => {
    console.log(
      `Your transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${connection.rpcEndpoint}`
    );
    return signature;
  };

  // Generate a random seed for the escrow
  const seed = new BN(randomBytes(8));

  // Generate keypairs for maker, taker, and two mints
  const [maker, taker, mintA, mintB] = Array.from({ length: 4 }, () =>
    Keypair.generate()
  );

  // Derive associated token accounts for maker and taker for both mints
  const [makerAtaA, makerAtaB, takerAtaA, takerAtaB] = [maker, taker]
    .map((a) =>
      [mintA, mintB].map((m) =>
        getAssociatedTokenAddressSync(m.publicKey, a.publicKey, false, tokenProgram)
      )
    )
    .flat();

  // Derive the escrow PDA using the seed and maker's public key
  const escrow = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
    program.programId
  )[0];

  // Derive the vault associated token account for the escrow
  const vault = getAssociatedTokenAddressSync(mintA.publicKey, escrow, true, tokenProgram);

  // Prepare all accounts needed for the tests
  const accounts = {
    maker: maker.publicKey,
    taker: taker.publicKey,
    mintA: mintA.publicKey,
    mintB: mintB.publicKey,
    makerAtaA,
    makerAtaB,
    takerAtaA,
    takerAtaB,
    escrow,
    vault,
    tokenProgram,
  }

  // Test: Airdrop SOL and create mints and token accounts
  it("Airdrop and create mints", async () => {
    // Get minimum lamports needed for rent exemption for a mint account
    let lamports = await getMinimumBalanceForRentExemptMint(connection);

    // Create a transaction with multiple instructions:
    // 1. Transfer SOL to maker and taker
    // 2. Create mint accounts for mintA and mintB
    // 3. Initialize mints, create associated token accounts, and mint tokens
    let tx = new Transaction();
    tx.instructions = [
      ...[maker, taker].map((account) =>
        SystemProgram.transfer({
          fromPubkey: provider.publicKey,
          toPubkey: account.publicKey,
          lamports: 10 * LAMPORTS_PER_SOL,
        })
      ),
      ...[mintA, mintB].map((mint) =>
        SystemProgram.createAccount({
          fromPubkey: provider.publicKey,
          newAccountPubkey: mint.publicKey,
          lamports,
          space: MINT_SIZE,
          programId: tokenProgram,
        })
      ),
      ...[
        { mint: mintA.publicKey, authority: maker.publicKey, ata: makerAtaA },
        { mint: mintB.publicKey, authority: taker.publicKey, ata: takerAtaB },
      ]
      .flatMap((x) => [
        // Initialize the mint
        createInitializeMint2Instruction(x.mint, 6, x.authority, null, tokenProgram),
        // Create the associated token account
        createAssociatedTokenAccountIdempotentInstruction(provider.publicKey, x.ata, x.authority, x.mint, tokenProgram),
        // Mint tokens to the associated token account
        createMintToInstruction(x.mint, x.ata, x.authority, 1e9, undefined, tokenProgram),
      ])
    ];

    // Send and confirm the transaction, logging the signature
    await provider.sendAndConfirm(tx, [mintA, mintB, maker, taker]).then(log);
  });

  // Test: Maker creates an escrow offer
  it("Make", async () => {
    await program.methods
      .make(seed, new BN(1e6), new BN(1e6)) // Specify the seed and amounts
      .accounts({ ...accounts })            // Provide all necessary accounts
      .signers([maker])                     // Maker signs the transaction
      .rpc()                                // Send the transaction
      .then(confirm)
      .then(log);
  });

  // Test: Refund (currently skipped with xit)
  xit("Refund", async () => {
    await program.methods
      .refund()
      .accounts({ ...accounts })
      .signers([maker])
      .rpc()
      .then(confirm)
      .then(log);
  });

  // Test: Taker accepts the escrow offer
  it("Take", async () => {
    try {
      await program.methods
        .take()
        .accounts({  ...accounts })
        .signers([taker])
        .rpc()
        .then(confirm)
        .then(log);
    } catch(e) {
      console.log(e);
      throw(e)
    }
  });

});