import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RapidFlow } from "../target/types/rapid_flow";

import { Account, AccountLayout, createMint, getAccount, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { before } from "mocha";

describe("rapid-flow", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
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

  before(async() => {
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

    console.log("\n========== Airdropping SOL to Bob ==========\n")
    const airdropSignature = await connection.requestAirdrop(
      BobWallet.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL  // 2 SOL
    );
    console.log("Sig: ", airdropSignature)
  
    console.log("\n========== Mint Accounts ==========\n")
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
      [Buffer.from("user_open_orders"), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
      program.programId
    );

    [BobOpenOrdersPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_open_orders"), marketPda.toBuffer(), BobWallet.publicKey.toBuffer()],
      program.programId
    );
  
    baseVault = await getAssociatedTokenAddress(
      baseMint,
      marketPda, 
      true
    );
  
    quoteVault = await getAssociatedTokenAddress(
      quoteMint,
      marketPda,
      true
    );
  
    const AliceBaseVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      baseMint,
      wallet.publicKey,  
    );
    AliceBaseVault = AliceBaseVaultAcc.address;
  
    const AliceQuoteVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      quoteMint,
      wallet.publicKey,  
    );
    AliceQuoteVault = AliceQuoteVaultAcc.address;

    const BobBaseVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      baseMint,
      BobWallet.publicKey,  
    );
    BobBaseVault = BobBaseVaultAcc.address;
  
    const BobQuoteVaultAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      quoteMint,
      BobWallet.publicKey,  
    );
    BobQuoteVault = BobQuoteVaultAcc.address;
  
    await mintTo(
      connection,
      wallet.payer,
      baseMint,
      AliceBaseVault,
      wallet.publicKey,
      0  // 1000 SOL without 9 decimals
    );
  
    await mintTo(
      connection,
      wallet.payer,
      quoteMint,
      AliceQuoteVault,
      wallet.publicKey,
      500  // 100,000 USDC without 6 decimals
    );

    await mintTo(
      connection,
      wallet.payer,
      baseMint,
      BobBaseVault,
      wallet.publicKey,
      100  // 10 SOL without 9 decimals
    );
  
    await mintTo(
      connection,
      wallet.payer,
      quoteMint,
      BobQuoteVault,
      wallet.publicKey,
      0  // 100,000 USDC with 6 decimals
    );

    // Debug: Check token balances
    const AliceBaseAccount = await getAccount(connection, AliceBaseVault);
    const AliceQuoteAccount = await getAccount(connection, AliceQuoteVault);
    const BobBaseAccount = await getAccount(connection, BobBaseVault);
    const BobQuoteAccount = await getAccount(connection, BobQuoteVault);

  
    console.log("\n========== Market Accounts ==========\n")
    console.log("Market PDA:", marketPda.toBase58());
    console.log("Bids PDA:", bidsPda.toBase58());
    console.log("Asks PDA:", asksPda.toBase58());
    console.log("Base Vault:", baseVault.toBase58());
    console.log("Quote Vault:", quoteVault.toBase58());
    
    console.log("\n========== Alice Accounts ==========\n")
    console.log("Base Vault:", AliceBaseVault.toBase58());
    console.log("Quote Vault:", AliceQuoteVault.toBase58());
    console.log("Open Orders PDA:", AliceOpenOrdersPda.toBase58());


    console.log("\n========== Bob Accounts ==========\n")
    console.log("Base Vault:", BobBaseVault.toBase58());
    console.log("Quote Vault:", BobQuoteVault.toBase58());
    console.log("Open Orders PDA:", BobOpenOrdersPda.toBase58());

    console.log("\n========== Balances ==========\n")
    console.log("Alice Base balance:", Number(AliceBaseAccount.amount),"(SOL)");
    console.log("Alice Quote balance:", Number(AliceQuoteAccount.amount),"(USDC)");
    console.log("Bob Base balance:", Number(BobBaseAccount.amount),"(SOL)");
    console.log("Bob Quote balance:", Number(BobQuoteAccount.amount),"(USDC)");
  });

  
  it("Is initialized!", async () => {
    console.log("\n>>>>>>>>>>>> Initializing Market <<<<<<<<<<<<\n")
    const tx = await program.methods.initialize().accounts({
        signer: wallet.publicKey,
        baseMint,
        quoteMint,
        //@ts-ignore
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        baseVault,
        quoteVault,
    }).signers([wallet.payer]).rpc();
    console.log("\nTransaction sig:", tx);
  });

// Alice places BID order (buying SOL with USDC at 10 USDC per SOL)
// Alice places BID order (buying SOL with USDC)
it("Bid order placed successfully", async() => {
  console.log("\n>>>>>>>>>>>> Placing bid order <<<<<<<<<<<<\n")
  const price = new anchor.BN(5); 
  const size  = new anchor.BN(2);  

    const tx = await program.methods.placeOrder(true, price, size).accounts({
      signer: wallet.publicKey,
      //@ts-ignore
      market: marketPda,
      asks: asksPda,
      bids: bidsPda,
      openOrders: AliceOpenOrdersPda,
      baseVault,
      quoteVault,
      userBaseVault: AliceBaseVault,
      userQuoteVault: AliceQuoteVault
    }).rpc();

    const AliceBaseAccount = await getAccount(connection, AliceBaseVault);
    const AliceQuoteAccount = await getAccount(connection, AliceQuoteVault);
    const BaseVaultAccount = await getAccount(connection, baseVault);
    const QuoteVaultAccount = await getAccount(connection, quoteVault);

    console.log("\n========== BALANCE AFTER BID ORDER ==========\n");
    console.log("Alice Base balance:", Number(AliceBaseAccount.amount),"(SOL)");
    console.log("Alice Quote balance:", Number(AliceQuoteAccount.amount),"(USDC)");
    console.log("Market's Base vault balance:", Number(BaseVaultAccount.amount),"(SOL)");
    console.log("Market's Quote vault balance:", Number(QuoteVaultAccount.amount),"(USDC)");
    console.log("\nTransaction sig:", tx);

    try {
      // Fetch the account data
      const openOrdersAccount = await program.account.openOrders.fetch(AliceOpenOrdersPda);
      
      console.log("\n========== Alice Open Orders Data ==========");
      console.log("Owner:", openOrdersAccount.owner.toBase58());
      console.log("Market:", openOrdersAccount.market.toBase58());
      console.log("Base Free:", openOrdersAccount.baseFree.toString());
      console.log("Base Locked:", openOrdersAccount.baseLocked.toString());
      console.log("Quote Free:", openOrdersAccount.quoteFree.toString());
      console.log("Quote Locked:", openOrdersAccount.quoteLocked.toString());
    } catch (error) {
      console.log("OpenOrders account not found or not initialized yet");
      return null;
    }
  })

// Bob places ASK order (selling SOL for USDC) - should match Alice's bid
it("Ask order placed successfully", async() => {
  console.log("\n>>>>>>>>>>>> Placing ask order <<<<<<<<<<<<\n");
  const price = new anchor.BN(5);
  const size  = new anchor.BN(2);

    const tx = await program.methods.placeOrder(false, price, size).accounts({
      signer: BobWallet.publicKey,
      //@ts-ignore
      market: marketPda,
      asks: asksPda,
      bids: bidsPda,
      openOrders: BobOpenOrdersPda,
      baseVault,
      quoteVault,
      userBaseVault: BobBaseVault,
      userQuoteVault: BobQuoteVault
    }).remainingAccounts([{pubkey: AliceOpenOrdersPda, isSigner: false, isWritable: true}]).signers([BobWallet]).rpc();

    const BobBaseAccount = await getAccount(connection, BobBaseVault);
    const BobQuoteAccount = await getAccount(connection, BobQuoteVault);
    const BaseVaultAccount = await getAccount(connection, baseVault);
    const QuoteVaultAccount = await getAccount(connection, quoteVault);

    console.log("\n========== BALANCE AFTER ASK ORDER ==========\n");
    console.log("Bob Base balance:", Number(BobBaseAccount.amount),"(SOL)");
    console.log("Bob Quote balance:", Number(BobQuoteAccount.amount),"(USDC)");
    console.log("Market's Base vault balance:", Number(BaseVaultAccount.amount),"(SOL)");
    console.log("Market's Quote vault balance:", Number(QuoteVaultAccount.amount),"(USDC)");
    console.log("\nTransaction sig:", tx);

    try {
      // Fetch the account data
      const openOrdersAccount = await program.account.openOrders.fetch(BobOpenOrdersPda);
      
      console.log("\n========== BOB Open Orders Data ==========");
      console.log("Owner:", openOrdersAccount.owner.toBase58());
      console.log("Market:", openOrdersAccount.market.toBase58());
      console.log("Base Free:", openOrdersAccount.baseFree.toString());
      console.log("Base Locked:", openOrdersAccount.baseLocked.toString());
      console.log("Quote Free:", openOrdersAccount.quoteFree.toString());
      console.log("Quote Locked:", openOrdersAccount.quoteLocked.toString());
    } catch (error) {
      console.log("OpenOrders account not found or not initialized yet");
      return null;
    }
  })
});