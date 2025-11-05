import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RapidFlow } from "../target/types/rapid_flow";

import {
  Account,
  AccountLayout,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { before } from "mocha";
import { assert } from "chai";

describe("rapid-flow", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const program = anchor.workspace.rapidFlow as Program<RapidFlow>;

  // Market
  let baseMint: anchor.web3.PublicKey;
  let quoteMint: anchor.web3.PublicKey;
  let marketPda: anchor.web3.PublicKey;
  let bidsPda: anchor.web3.PublicKey;
  let asksPda: anchor.web3.PublicKey;
  let baseVault: anchor.web3.PublicKey;
  let quoteVault: anchor.web3.PublicKey;

  let AliceBaseVault: anchor.web3.PublicKey;
  let AliceQuoteVault: anchor.web3.PublicKey;
  let AliceOpenOrdersPda: anchor.web3.PublicKey;

  let BobWallet = Keypair.generate();
  let BobBaseVault: PublicKey;
  let BobQuoteVault: PublicKey;
  let BobOpenOrdersPda: PublicKey;

  let DogWallet = Keypair.generate();
  let DogBaseVault: PublicKey;
  let DogQuoteVault: PublicKey;
  let DogOpenOrdersPda: PublicKey;

  let programDataAccount: PublicKey;

  before(async () => {
    // SOL
    baseMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9
    );

    // USDC
    quoteMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // console.log("\n========== Airdropping SOL to Bob ==========\n");
    // const airdropSignature = await connection.requestAirdrop(
    //   BobWallet.publicKey,
    //   2 * anchor.web3.LAMPORTS_PER_SOL // 2 SOL
    // );
    // console.log("Sig: ", airdropSignature);

    // console.log("\n========== Airdropping SOL to Dog ==========\n");
    // const airdropSignature1 = await connection.requestAirdrop(
    //   DogWallet.publicKey,
    //   2 * anchor.web3.LAMPORTS_PER_SOL // 2 SOL
    // );
    // console.log("Sig: ", airdropSignature1);

    console.log("\n========== Mint Accounts ==========\n");
    console.log("Base Mint:", baseMint.toBase58());
    console.log("Quote Mint:", quoteMint.toBase58());

    [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.toBuffer(), quoteMint.toBuffer()],
      program.programId
    );

    [bidsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bids"), marketPda.toBuffer()],
      program.programId
    );

    [asksPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("asks"), marketPda.toBuffer()],
      program.programId
    );

    [AliceOpenOrdersPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_open_orders"),
        marketPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    [BobOpenOrdersPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_open_orders"),
        marketPda.toBuffer(),
        BobWallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    [DogOpenOrdersPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_open_orders"),
        marketPda.toBuffer(),
        DogWallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    baseVault = await getAssociatedTokenAddress(baseMint, marketPda, true);

    quoteVault = await getAssociatedTokenAddress(quoteMint, marketPda, true);

    const AliceBaseVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      baseMint,
      wallet.publicKey
    );
    AliceBaseVault = AliceBaseVaultAcc.address;

    const AliceQuoteVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      quoteMint,
      wallet.publicKey
    );
    AliceQuoteVault = AliceQuoteVaultAcc.address;

    const BobBaseVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      baseMint,
      BobWallet.publicKey
    );
    BobBaseVault = BobBaseVaultAcc.address;

    const BobQuoteVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      quoteMint,
      BobWallet.publicKey
    );
    BobQuoteVault = BobQuoteVaultAcc.address;

    const DogBaseVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      baseMint,
      DogWallet.publicKey
    );
    DogBaseVault = DogBaseVaultAcc.address;

    const DogQuoteVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      quoteMint,
      DogWallet.publicKey
    );
    DogQuoteVault = DogQuoteVaultAcc.address;

    await mintTo(
      connection,
      wallet.payer,
      baseMint,
      AliceBaseVault,
      wallet.publicKey,
      0 // 1000 SOL without 9 decimals
    );

    await mintTo(
      connection,
      wallet.payer,
      quoteMint,
      AliceQuoteVault,
      wallet.publicKey,
      500 // 100,000 USDC without 6 decimals
    );

    await mintTo(
      connection,
      wallet.payer,
      baseMint,
      BobBaseVault,
      wallet.publicKey,
      100 // 10 SOL without 9 decimals
    );

    await mintTo(
      connection,
      wallet.payer,
      quoteMint,
      BobQuoteVault,
      wallet.publicKey,
      0 // 100,000 USDC with 6 decimals
    );

    await mintTo(
      connection,
      wallet.payer,
      baseMint,
      DogBaseVault,
      wallet.publicKey,
      100 // 10 SOL without 9 decimals
    );

    await mintTo(
      connection,
      wallet.payer,
      quoteMint,
      DogQuoteVault,
      wallet.publicKey,
      0 // 100,000 USDC with 6 decimals
    );

    // Debug: Check token balances
    const AliceBaseAccount = await getAccount(connection, AliceBaseVault);
    const AliceQuoteAccount = await getAccount(connection, AliceQuoteVault);
    const BobBaseAccount = await getAccount(connection, BobBaseVault);
    const BobQuoteAccount = await getAccount(connection, BobQuoteVault);
    const DogBaseAccount = await getAccount(connection, DogBaseVault);
    const DogQuoteAccount = await getAccount(connection, DogQuoteVault);

    console.log("\n========== Market Accounts ==========\n");
    console.log("Market PDA:", marketPda.toBase58());
    console.log("Bids PDA:", bidsPda.toBase58());
    console.log("Asks PDA:", asksPda.toBase58());
    console.log("Base Vault:", baseVault.toBase58());
    console.log("Quote Vault:", quoteVault.toBase58());

    console.log("\n========== Alice Accounts ==========\n");
    console.log("Base Vault:", AliceBaseVault.toBase58());
    console.log("Quote Vault:", AliceQuoteVault.toBase58());
    console.log("Open Orders PDA:", AliceOpenOrdersPda.toBase58());

    console.log("\n========== Bob Accounts ==========\n");
    console.log("Base Vault:", BobBaseVault.toBase58());
    console.log("Quote Vault:", BobQuoteVault.toBase58());
    console.log("Open Orders PDA:", BobOpenOrdersPda.toBase58());

    console.log("\n========== Dog Accounts ==========\n");
    console.log("Base Vault:", DogBaseVault.toBase58());
    console.log("Quote Vault:", DogQuoteVault.toBase58());
    console.log("Open Orders PDA:", DogOpenOrdersPda.toBase58());

    console.log("\n========== Balances ==========\n");
    console.log(
      "Alice Base balance:",
      Number(AliceBaseAccount.amount),
      "(SOL)"
    );
    console.log(
      "Alice Quote balance:",
      Number(AliceQuoteAccount.amount),
      "(USDC)"
    );
    console.log("Bob Base balance:", Number(BobBaseAccount.amount), "(SOL)");
    console.log("Bob Quote balance:", Number(BobQuoteAccount.amount), "(USDC)");
    console.log("Dog Base balance:", Number(DogBaseAccount.amount), "(SOL)");
    console.log("Dog Quote balance:", Number(DogQuoteAccount.amount), "(USDC)");

    // Derive ProgramData PDA using the BPF Loader Upgradeable program ID
    const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
      "BPFLoaderUpgradeab1e11111111111111111111111"
    );
    programDataAccount = PublicKey.findProgramAddressSync(
      [program.programId.toBuffer()],
      BPF_LOADER_UPGRADEABLE_PROGRAM_ID
    )[0];
    console.log(`\nprogramDataAccount: ${programDataAccount.toString()}`);

    // Verify ProgramData exists after deployment
    const programData = await connection.getAccountInfo(programDataAccount);
    assert.ok(programData, "ProgramData should exist after deployment");

    // Check the upgrade authority
    const upgradeAuthorityOption = programData.data[12];
    if (upgradeAuthorityOption === 1) {
      const currentAuthority = new PublicKey(programData.data.slice(13, 45));
      console.log(`Current Upgrade Authority: ${currentAuthority.toString()}`);
      console.log(`Test Wallet: ${wallet.publicKey.toString()}`);
      console.log(`Match: ${currentAuthority.equals(wallet.publicKey)}`);

      if (!currentAuthority.equals(wallet.publicKey)) {
        console.log("\n⚠️⚠️⚠️ AUTHORITY MISMATCH ⚠️⚠️⚠️");
        console.log("\nThe test wallet is NOT the upgrade authority!");
        console.log("\nTo fix this, run:");
        console.log("  1. anchor build");
        console.log("  2. anchor deploy");
        console.log("  3. anchor test --skip-deploy");
        console.log(
          "\nOr temporarily disable the admin check in initialize.rs\n"
        );
      } else {
        console.log(
          "\n✅ Wallet IS the upgrade authority - tests should pass!\n"
        );
      }
    }
  });

  it("✅ Happy Path: Successfully initializes the market as admin", async () => {
    console.log(
      "\n>>>>>>>>>>>> Initializing Market (Happy Path) <<<<<<<<<<<<\n"
    );

    // The `wallet` from the provider is the admin (upgrade authority)
    const tx = await program.methods
      .initialize()
      .accounts({
        // 1. Accounts from the struct
        signer: wallet.publicKey, // Admin wallet
        baseMint: baseMint,
        quoteMint: quoteMint,
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        baseVault: baseVault,
        quoteVault: quoteVault,

        // 2. Program accounts
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,

        // 3. Admin check accounts
        thisProgram: program.programId,
        programData: programDataAccount,
      })
      .rpc(); // No extra signers needed, provider handles admin `wallet`

    console.log("\nTransaction sig:", tx);

    // === Assertions ===
    // Check that the accounts were created and have the correct data
    const marketAccount = await program.account.market.fetch(marketPda);
    assert.ok(marketAccount.authority.equals(wallet.publicKey));
    assert.ok(marketAccount.baseMint.equals(baseMint));
    assert.ok(marketAccount.quoteMint.equals(quoteMint));
    assert.ok(marketAccount.bids.equals(bidsPda));
    assert.ok(marketAccount.asks.equals(asksPda));
    assert.ok(marketAccount.baseVault.equals(baseVault));
    assert.ok(marketAccount.quoteVault.equals(quoteVault));

    const bidsAccount = await program.account.orderBook.fetch(bidsPda);
    assert.strictEqual(bidsAccount.isBid, true);
    assert.ok(bidsAccount.market.equals(marketPda));

    const asksAccount = await program.account.orderBook.fetch(asksPda);
    assert.strictEqual(asksAccount.isBid, false);
    assert.ok(asksAccount.market.equals(marketPda));

    // Check that the vaults were created and are owned by the market PDA
    const baseVaultAccount = await getAccount(connection, baseVault);
    assert.ok(baseVaultAccount.owner.equals(marketPda));

    const quoteVaultAccount = await getAccount(connection, quoteVault);
    assert.ok(quoteVaultAccount.owner.equals(marketPda));

    console.log(
      "\n✅ Market, Bids, and Asks accounts initialized successfully!\n"
    );
  });

  // it("❌ Unauthorized: Non-admin cannot initialize market", async () => {
  //   console.log(
  //     "\n>>>>>>>>>>>> Testing Non-Admin Initialization <<<<<<<<<<<<\n"
  //   );

  //   // Create a different market with different mints to avoid conflicts
  //   const newBaseMint = await createMint(
  //     connection,
  //     wallet.payer,
  //     wallet.publicKey,
  //     null,
  //     9
  //   );

  //   const newQuoteMint = await createMint(
  //     connection,
  //     wallet.payer,
  //     wallet.publicKey,
  //     null,
  //     6
  //   );

  //   const [newMarketPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("market"), newBaseMint.toBuffer(), newQuoteMint.toBuffer()],
  //     program.programId
  //   );

  //   const [newBidsPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("bids"), newMarketPda.toBuffer()],
  //     program.programId
  //   );

  //   const [newAsksPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("asks"), newMarketPda.toBuffer()],
  //     program.programId
  //   );

  //   const newBaseVault = await getAssociatedTokenAddress(
  //     newBaseMint,
  //     newMarketPda,
  //     true
  //   );

  //   const newQuoteVault = await getAssociatedTokenAddress(
  //     newQuoteMint,
  //     newMarketPda,
  //     true
  //   );

  //   // Try to initialize with Bob (not the admin)
  //   try {
  //     await program.methods
  //       .initialize()
  //       .accounts({
  //         signer: BobWallet.publicKey,
  //         baseMint: newBaseMint,
  //         quoteMint: newQuoteMint,
  //         market: newMarketPda,
  //         bids: newBidsPda,
  //         asks: newAsksPda,
  //         baseVault: newBaseVault,
  //         quoteVault: newQuoteVault,
  //         systemProgram: SystemProgram.programId,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         thisProgram: program.programId,
  //         programData: programDataAccount,
  //       })
  //       .signers([BobWallet])
  //       .rpc();

  //     // If we get here, the test should fail
  //     assert.fail("Non-admin should not be able to initialize market");
  //   } catch (err) {
  //     console.log("✅ Correctly rejected non-admin initialization");
  //     console.log("Error:", err.message);

  //     // Verify it's the UnauthorizedAccess error
  //     assert.ok(
  //       err.message.includes("UnauthorizedAccess") ||
  //         err.message.includes("6001"),
  //       "Should throw UnauthorizedAccess error"
  //     );
  //   }
  // });
});

// // Alice places BID order (buying SOL with USDC at 10 USDC per SOL)
// // Alice places BID order (buying SOL with USDC)
// it("Alice places Bid order successfully", async() => {
//   console.log("\n>>>>>>>>>>>> Placing bid order <<<<<<<<<<<<\n")
//   const price = new anchor.BN(10);
//   const size  = new anchor.BN(6);

//     const tx = await program.methods.placeOrder(true, price, size).accounts({
//       signer: wallet.publicKey,
//       //@ts-ignore
//       market: marketPda,
//       asks: asksPda,
//       bids: bidsPda,
//       openOrders: AliceOpenOrdersPda,
//       baseVault,
//       quoteVault,
//       userBaseVault: AliceBaseVault,
//       userQuoteVault: AliceQuoteVault
//     }).rpc();

//     const AliceBaseAccount = await getAccount(connection, AliceBaseVault);
//     const AliceQuoteAccount = await getAccount(connection, AliceQuoteVault);
//     const BaseVaultAccount = await getAccount(connection, baseVault);
//     const QuoteVaultAccount = await getAccount(connection, quoteVault);

//     console.log("\n========== BALANCE AFTER BID ORDER ==========\n");
//     console.log("Alice Base balance:", Number(AliceBaseAccount.amount),"(SOL)");
//     console.log("Alice Quote balance:", Number(AliceQuoteAccount.amount),"(USDC)");
//     console.log("Market's Base vault balance:", Number(BaseVaultAccount.amount),"(SOL)");
//     console.log("Market's Quote vault balance:", Number(QuoteVaultAccount.amount),"(USDC)");
//     console.log("\nTransaction sig:", tx);
//   })

// // Bob places ASK order (selling SOL for USDC) - should match Alice's bid
// it("Bob places Ask order successfully", async() => {
//   console.log("\n>>>>>>>>>>>> Placing ask order <<<<<<<<<<<<\n");
//   const price = new anchor.BN(10);
//   const size  = new anchor.BN(4);

//     const tx = await program.methods.placeOrder(false, price, size).accounts({
//       signer: BobWallet.publicKey,
//       //@ts-ignore
//       market: marketPda,
//       asks: asksPda,
//       bids: bidsPda,
//       openOrders: BobOpenOrdersPda,
//       baseVault,
//       quoteVault,
//       userBaseVault: BobBaseVault,
//       userQuoteVault: BobQuoteVault
//     }).remainingAccounts([{pubkey: AliceOpenOrdersPda, isSigner: false, isWritable: true}]).signers([BobWallet]).rpc();

//     const BobBaseAccount = await getAccount(connection, BobBaseVault);
//     const BobQuoteAccount = await getAccount(connection, BobQuoteVault);
//     const BaseVaultAccount = await getAccount(connection, baseVault);
//     const QuoteVaultAccount = await getAccount(connection, quoteVault);

//     console.log("\n========== BALANCE AFTER ASK ORDER ==========\n");
//     console.log("Bob Base balance:", Number(BobBaseAccount.amount),"(SOL)");
//     console.log("Bob Quote balance:", Number(BobQuoteAccount.amount),"(USDC)");
//     console.log("Market's Base vault balance:", Number(BaseVaultAccount.amount),"(SOL)");
//     console.log("Market's Quote vault balance:", Number(QuoteVaultAccount.amount),"(USDC)");
//     console.log("\nTransaction sig:", tx);
//   });

//   it("Dog places Ask order successfully", async() => {
//     console.log("\n>>>>>>>>>>>> Placing ask order <<<<<<<<<<<<\n");
//     const price = new anchor.BN(10);
//     const size  = new anchor.BN(2);

//       const tx = await program.methods.placeOrder(false, price, size).accounts({
//         signer: DogWallet.publicKey,
//         //@ts-ignore
//         market: marketPda,
//         asks: asksPda,
//         bids: bidsPda,
//         openOrders: DogOpenOrdersPda,
//         baseVault,
//         quoteVault,
//         userBaseVault: DogBaseVault,
//         userQuoteVault: DogQuoteVault
//       }).remainingAccounts([{pubkey: BobOpenOrdersPda, isSigner: false, isWritable: true}]).signers([DogWallet]).rpc();

//       const DogBaseAccount = await getAccount(connection, DogBaseVault);
//       const DogQuoteAccount = await getAccount(connection, DogQuoteVault);
//       const BaseVaultAccount = await getAccount(connection, baseVault);
//       const QuoteVaultAccount = await getAccount(connection, quoteVault);

//       console.log("\n========== BALANCE AFTER ASK ORDER ==========\n");
//       console.log("Dog Base balance:", Number(DogBaseAccount.amount),"(SOL)");
//       console.log("Dog Quote balance:", Number(DogQuoteAccount.amount),"(USDC)");
//       console.log("Market's Base vault balance:", Number(BaseVaultAccount.amount),"(SOL)");
//       console.log("Market's Quote vault balance:", Number(QuoteVaultAccount.amount),"(USDC)");
//       console.log("\nTransaction sig:", tx);

//       try {
//         // Fetch the account data
//         const openOrdersAccount = await program.account.openOrders.fetch(AliceOpenOrdersPda);

//         console.log("\n========== Alice Open Orders Data ==========");
//         console.log("Owner:", openOrdersAccount.owner.toBase58());
//         console.log("Market:", openOrdersAccount.market.toBase58());
//         console.log("Base Free:", openOrdersAccount.baseFree.toString());
//         console.log("Base Locked:", openOrdersAccount.baseLocked.toString());
//         console.log("Quote Free:", openOrdersAccount.quoteFree.toString());
//         console.log("Quote Locked:", openOrdersAccount.quoteLocked.toString());
//       } catch (error) {
//         console.log("OpenOrders account not found or not initialized yet");
//         return null;
//       }

//       try {
//         // Fetch the account data
//         const openOrdersAccount = await program.account.openOrders.fetch(BobOpenOrdersPda);

//         console.log("\n========== BOB Open Orders Data ==========");
//         console.log("Owner:", openOrdersAccount.owner.toBase58());
//         console.log("Market:", openOrdersAccount.market.toBase58());
//         console.log("Base Free:", openOrdersAccount.baseFree.toString());
//         console.log("Base Locked:", openOrdersAccount.baseLocked.toString());
//         console.log("Quote Free:", openOrdersAccount.quoteFree.toString());
//         console.log("Quote Locked:", openOrdersAccount.quoteLocked.toString());
//       } catch (error) {
//         console.log("OpenOrders account not found or not initialized yet");
//         return null;
//       }

//       try {
//         // Fetch the account data
//         const openOrdersAccount = await program.account.openOrders.fetch(DogOpenOrdersPda);

//         console.log("\n========== Dog Open Orders Data ==========");
//         console.log("Owner:", openOrdersAccount.owner.toBase58());
//         console.log("Market:", openOrdersAccount.market.toBase58());
//         console.log("Base Free:", openOrdersAccount.baseFree.toString());
//         console.log("Base Locked:", openOrdersAccount.baseLocked.toString());
//         console.log("Quote Free:", openOrdersAccount.quoteFree.toString());
//         console.log("Quote Locked:", openOrdersAccount.quoteLocked.toString());
//       } catch (error) {
//         console.log("OpenOrders account not found or not initialized yet");
//         return null;
//       }
//   })
// });
