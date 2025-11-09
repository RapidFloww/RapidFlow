import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RapidFlow } from "../target/types/rapid_flow";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("rapid-flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;
  const program = anchor.workspace.rapidFlow as Program<RapidFlow>;

  // Market accounts
  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let marketPda: PublicKey;
  let bidsPda: PublicKey;
  let asksPda: PublicKey;
  let baseVault: PublicKey;
  let quoteVault: PublicKey;
// Test users configuration - SIMPLIFIED to 3 users
const users = [
  {
    name: "Alice",
    wallet: wallet,
    baseAmount: 1000,
    quoteAmount: 10000,
    needsAirdrop: false,
  },
  {
    name: "Bob",
    wallet: null as any,
    baseAmount: 800,
    quoteAmount: 8000,
    needsAirdrop: true,
  },
  {
    name: "Charlie",
    wallet: null as any,
    baseAmount: 600,
    quoteAmount: 6000,
    needsAirdrop: true,
  },
];

// SIMPLIFIED test orders - Easy to understand scenarios
const testOrders = [
  // Step 1: Alice places a BID (wants to BUY base token with quote token)
  {
    user: "Alice",
    isBid: true,
    price: 100,
    size: 5,
    description: "Alice places Bid @ 100 (wants to buy 5 base for 500 quote)",
    expectedBalanceChanges: {
      Alice: { base: 0, quote: -500, baseLocked: 0, quoteLocked: 500 },
      market: { base: 0, quote: 500 },
    },
  },
  
  // Step 2: Bob places an ASK (wants to SELL base token for quote token)
  {
    user: "Bob",
    isBid: false,
    price: 110,
    size: 3,
    description: "Bob places Ask @ 110 (wants to sell 3 base for 330 quote)",
    expectedBalanceChanges: {
      Bob: { base: -3, quote: 0, baseLocked: 3, quoteLocked: 0 },
      market: { base: 3, quote: 0 },
    },
  },
  
  // Step 3: Charlie places an ASK that MATCHES Alice's bid
  // Charlie sells at 95, Alice buys at 100, so trade happens at 100
  {
    user: "Charlie",
    isBid: false,
    price: 95,
    size: 2,
    description: "Charlie places Ask @ 95 (MATCHES Alice's Bid @ 100 - trades 2 base)",
    matchedUsers: ["Alice"],
    skipAssertions: true,
    expectedBalanceChanges: {},
    // What happens: Charlie sells 2 base, Alice buys 2 base at price 100
    // Result: Alice gets 2 base (baseFree: 2), Charlie gets 200 quote (quoteFree: 200)
    //         Alice's quoteLocked reduces by 200 (now 300 locked)
  },
  
  // Step 4: Bob adds another bid
  {
    user: "Bob",
    isBid: true,
    price: 90,
    size: 4,
    description: "Bob places Bid @ 90 (wants to buy 4 base for 360 quote)",
    expectedBalanceChanges: {
      Bob: { base: 0, quote: -360, baseLocked: 0, quoteLocked: 360 },
      market: { base: 0, quote: 360 },
    },
  },
];

  // Track balances across tests
  const balanceTracker = new Map<
    string,
    {
      base: number;
      quote: number;
      baseLocked: number;
      quoteLocked: number;
    }
  >();

  before(async () => {
    // Create mints
    baseMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9
    );
    quoteMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    console.log("\n========== Mint Accounts ==========");
    console.log("Base Mint:", baseMint.toBase58());
    console.log("Quote Mint:", quoteMint.toBase58());

    // Generate wallets for users that need them
    for (const user of users) {
      if (user.needsAirdrop) {
        user.wallet = Keypair.generate();
        console.log(`\n========== Airdropping SOL to ${user.name} ==========`);
        const sig = await connection.requestAirdrop(
          user.wallet.publicKey,
          2 * anchor.web3.LAMPORTS_PER_SOL
        );
        console.log("Sig:", sig);
        // Wait for airdrop confirmation
        await connection.confirmTransaction(sig);
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      }
    }

    // Derive PDAs
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

    baseVault = await getAssociatedTokenAddress(baseMint, marketPda, true);
    quoteVault = await getAssociatedTokenAddress(quoteMint, marketPda, true);

    // Setup user accounts
    for (const user of users) {
      const userPubkey =
        user.wallet instanceof Keypair
          ? user.wallet.publicKey
          : (user.wallet as anchor.Wallet).publicKey;

      // Create token accounts
      const baseAcc = await getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        baseMint,
        userPubkey
      );
      const quoteAcc = await getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        quoteMint,
        userPubkey
      );

      // Derive open orders PDA for place_order (uses "user_open_orders")
      const [openOrdersPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_open_orders"),
          marketPda.toBuffer(),
          userPubkey.toBuffer(),
        ],
        program.programId
      );

      // Store in user object
      (user as any).baseVault = baseAcc.address;
      (user as any).quoteVault = quoteAcc.address;
      (user as any).openOrdersPda = openOrdersPda;

      // Mint tokens
      if (user.baseAmount > 0) {
        await mintTo(
          connection,
          wallet.payer,
          baseMint,
          baseAcc.address,
          wallet.publicKey,
          user.baseAmount
        );
      }
      if (user.quoteAmount > 0) {
        await mintTo(
          connection,
          wallet.payer,
          quoteMint,
          quoteAcc.address,
          wallet.publicKey,
          user.quoteAmount
        );
      }

      // Initialize balance tracker
      balanceTracker.set(user.name, {
        base: user.baseAmount,
        quote: user.quoteAmount,
        baseLocked: 0,
        quoteLocked: 0,
      });
    }

    // Initialize market balance tracker
    balanceTracker.set("market", {
      base: 0,
      quote: 0,
      baseLocked: 0,
      quoteLocked: 0,
    });

    // Log all accounts
    console.log("\n========== Market Accounts ==========");
    console.log("Market PDA:", marketPda.toBase58());
    console.log("Bids PDA:", bidsPda.toBase58());
    console.log("Asks PDA:", asksPda.toBase58());
    console.log("Base Vault:", baseVault.toBase58());
    console.log("Quote Vault:", quoteVault.toBase58());

    // Log user accounts and balances
    for (const user of users) {
      console.log(`\n========== ${user.name} Accounts ==========`);
      console.log("Base Vault:", (user as any).baseVault.toBase58());
      console.log("Quote Vault:", (user as any).quoteVault.toBase58());
      console.log("Open Orders PDA:", (user as any).openOrdersPda.toBase58());

      const baseAcc = await getAccount(connection, (user as any).baseVault);
      const quoteAcc = await getAccount(connection, (user as any).quoteVault);
      console.log("Base balance:", Number(baseAcc.amount), "(SOL)");
      console.log("Quote balance:", Number(quoteAcc.amount), "(USDC)");
    }
  });

  it("Is initialized!", async () => {
    console.log("\n>>>>>>>>>>>> Initializing Market <<<<<<<<<<<<\n");
    const tx = await program.methods
      .initialize()
      .accounts({
        signer: wallet.publicKey,
        baseMint,
        quoteMint,
        //@ts-ignore
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        baseVault,
        quoteVault,
      })
      .signers([wallet.payer])
      .rpc();
    console.log("Transaction sig:", tx);

    // Verify market accounts exist
    const marketAccount = await program.account.market.fetch(marketPda);
    assert.equal(
      marketAccount.baseMint.toBase58(),
      baseMint.toBase58(),
      "Base mint should match"
    );
    assert.equal(
      marketAccount.quoteMint.toBase58(),
      quoteMint.toBase58(),
      "Quote mint should match"
    );
  });

  // Generate test cases for each order
  testOrders.forEach((order) => {
    it(order.description, async () => {
      console.log(`\n>>>>>>>>>>>> ${order.description} <<<<<<<<<<<<\n`);

      const user = users.find((u) => u.name === order.user)!;
      const userWallet =
        user.wallet instanceof Keypair ? user.wallet : user.wallet.payer;
      const userPubkey =
        user.wallet instanceof Keypair
          ? user.wallet.publicKey
          : (user.wallet as anchor.Wallet).publicKey;

      // Capture balances before order
      const beforeBalances = new Map<string, any>();

      for (const u of users) {
        const baseAcc = await getAccount(connection, (u as any).baseVault);
        const quoteAcc = await getAccount(connection, (u as any).quoteVault);
        let openOrders = null;
        try {
          openOrders = await program.account.openOrders.fetch(
            (u as any).openOrdersPda
          );
        } catch {}

        beforeBalances.set(u.name, {
          base: Number(baseAcc.amount),
          quote: Number(quoteAcc.amount),
          baseLocked: openOrders ? Number(openOrders.baseLocked) : 0,
          quoteLocked: openOrders ? Number(openOrders.quoteLocked) : 0,
        });
      }

      const baseVaultBefore = await getAccount(connection, baseVault);
      const quoteVaultBefore = await getAccount(connection, quoteVault);
      beforeBalances.set("market", {
        base: Number(baseVaultBefore.amount),
        quote: Number(quoteVaultBefore.amount),
      });

      const price = new anchor.BN(order.price);
      const size = new anchor.BN(order.size);

      // Build remaining accounts for matched orders
      const remainingAccounts = order.matchedUsers
        ? order.matchedUsers.map((userName) => {
            const matchedUser = users.find((u) => u.name === userName)!;
            return {
              pubkey: (matchedUser as any).openOrdersPda,
              isSigner: false,
              isWritable: true,
            };
          })
        : [];

      console.log("Remaining accounts:", remainingAccounts.length);
      if (order.matchedUsers) {
        console.log("Expected to match with:", order.matchedUsers.join(", "));
      }

      const tx = await program.methods
        .placeOrder(order.isBid, price, size)
        .accounts({
          signer: userPubkey,
          //@ts-ignore
          market: marketPda,
          asks: asksPda,
          bids: bidsPda,
          userOpenOrders: (user as any).openOrdersPda,
          baseVault,
          quoteVault,
          userBaseVault: (user as any).baseVault,
          userQuoteVault: (user as any).quoteVault,
        })
        .remainingAccounts(remainingAccounts)
        .signers([userWallet])
        .rpc();

      // Add delay and confirmation for order processing
      await connection.confirmTransaction(tx);
      await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay

      // Capture balances after order
      const afterBalances = new Map<string, any>();

      for (const u of users) {
        const baseAcc = await getAccount(connection, (u as any).baseVault);
        const quoteAcc = await getAccount(connection, (u as any).quoteVault);
        let openOrders = null;
        try {
          openOrders = await program.account.openOrders.fetch(
            (u as any).openOrdersPda
          );
        } catch {}

        afterBalances.set(u.name, {
          base: Number(baseAcc.amount),
          quote: Number(quoteAcc.amount),
          baseLocked: openOrders ? Number(openOrders.baseLocked) : 0,
          quoteLocked: openOrders ? Number(openOrders.quoteLocked) : 0,
        });
      }

      const baseVaultAfter = await getAccount(connection, baseVault);
      const quoteVaultAfter = await getAccount(connection, quoteVault);
      afterBalances.set("market", {
        base: Number(baseVaultAfter.amount),
        quote: Number(quoteVaultAfter.amount),
      });

      // Log balances
      console.log(`\n========== BALANCE CHANGES ==========`);

      // Assert expected balance changes
      if (order.expectedBalanceChanges && !order.skipAssertions) {
        for (const [entityName, expected] of Object.entries(
          order.expectedBalanceChanges
        )) {
          const before = beforeBalances.get(entityName)!;
          const after = afterBalances.get(entityName)!;

          console.log(`\n${entityName}:`);

          if ("base" in expected) {
            const actualBaseChange = after.base - before.base;
            console.log(
              `  Base: ${before.base} -> ${after.base} (change: ${actualBaseChange}, expected: ${expected.base})`
            );
            assert.equal(
              actualBaseChange,
              expected.base,
              `${entityName} base balance change should be ${expected.base}`
            );
          }

          if ("quote" in expected) {
            const actualQuoteChange = after.quote - before.quote;
            console.log(
              `  Quote: ${before.quote} -> ${after.quote} (change: ${actualQuoteChange}, expected: ${expected.quote})`
            );
            assert.equal(
              actualQuoteChange,
              expected.quote,
              `${entityName} quote balance change should be ${expected.quote}`
            );
          }

          if ("baseLocked" in expected && entityName !== "market") {
            const actualBaseLockedChange = after.baseLocked - before.baseLocked;
            console.log(
              `  Base Locked: ${before.baseLocked} -> ${after.baseLocked} (change: ${actualBaseLockedChange}, expected: ${expected.baseLocked})`
            );
            assert.equal(
              actualBaseLockedChange,
              expected.baseLocked,
              `${entityName} base locked change should be ${expected.baseLocked}`
            );
          }

          if ("quoteLocked" in expected && entityName !== "market") {
            const actualQuoteLockedChange =
              after.quoteLocked - before.quoteLocked;
            console.log(
              `  Quote Locked: ${before.quoteLocked} -> ${after.quoteLocked} (change: ${actualQuoteLockedChange}, expected: ${expected.quoteLocked})`
            );
            assert.equal(
              actualQuoteLockedChange,
              expected.quoteLocked,
              `${entityName} quote locked change should be ${expected.quoteLocked}`
            );
          }
        }
      }

      console.log("\n========== Market Vault Balances ==========");
      console.log("Base vault:", Number(baseVaultAfter.amount), "(SOL)");
      console.log("Quote vault:", Number(quoteVaultAfter.amount), "(USDC)");
      console.log("\nTransaction sig:", tx);

      // Log open orders for last test
      if (order === testOrders[testOrders.length - 1]) {
        for (const u of users) {
          await logUserOpenOrdersState(u.name, (u as any).openOrdersPda);
        }
      }
    });
  });

describe("Settle Funds Tests", () => {
  
  it("Alice settles all her base funds (2 base from matched trade)", async () => {
    console.log("\n>>>>>>>>>>>> Alice settles 2 base funds <<<<<<<<<<<<\n");

    const user = users.find((u) => u.name === "Alice")!;
    const userWallet = user.wallet instanceof Keypair ? user.wallet : user.wallet.payer;
    const userPubkey = user.wallet instanceof Keypair
      ? user.wallet.publicKey
      : (user.wallet as anchor.Wallet).publicKey;

    // Get current state
    let openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    const baseFree = Number(openOrders.baseFree);
    const quoteLocked = Number(openOrders.quoteLocked);
    
    console.log("Base free before settle:", baseFree);
    console.log("Quote locked (should remain):", quoteLocked);
    
    assert.equal(baseFree, 2, "Alice should have 2 base free");
    assert.equal(quoteLocked, 300, "Alice should have 300 quote locked");

    // Capture balances before
    const baseAccBefore = await getAccount(connection, (user as any).baseVault);
    const baseVaultBefore = await getAccount(connection, baseVault);

    // Settle all 2 base
    const tx = await program.methods
      .settleFunds(true, new anchor.BN(baseFree))
      .accounts({
        signer: userPubkey,
        //@ts-ignore
        market: marketPda,
        openOrders: (user as any).openOrdersPda,
        baseVault,
        quoteVault,
        userBaseVault: (user as any).baseVault,
        userQuoteVault: (user as any).quoteVault,
      })
      .signers([userWallet])
      .rpc();

    await connection.confirmTransaction(tx);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Capture balances after
    const baseAccAfter = await getAccount(connection, (user as any).baseVault);
    const baseVaultAfter = await getAccount(connection, baseVault);
    openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);

    console.log("\n========== SETTLEMENT RESULTS ==========");
    console.log("Base settled:", baseFree);
    console.log("User base: %d -> %d (change: +%d)", 
      Number(baseAccBefore.amount), 
      Number(baseAccAfter.amount),
      Number(baseAccAfter.amount) - Number(baseAccBefore.amount)
    );
    console.log("Market base vault: %d -> %d (change: -%d)", 
      Number(baseVaultBefore.amount), 
      Number(baseVaultAfter.amount),
      Number(baseVaultBefore.amount) - Number(baseVaultAfter.amount)
    );
    console.log("Base free after:", Number(openOrders.baseFree));
    console.log("Quote locked after (unchanged):", Number(openOrders.quoteLocked));

    // Assertions
    assert.equal(
      Number(baseAccAfter.amount) - Number(baseAccBefore.amount),
      2,
      "Alice should receive 2 base"
    );
    assert.equal(
      Number(baseVaultBefore.amount) - Number(baseVaultAfter.amount),
      2,
      "Market vault should decrease by 2 base"
    );
    assert.equal(
      Number(openOrders.baseFree),
      0,
      "Base free should be zero after settling"
    );
    assert.equal(
      Number(openOrders.quoteLocked),
      300,
      "Quote locked should remain 300 (unchanged)"
    );

    console.log("\n✓ Transaction sig:", tx);
  });

  it("Charlie settles all his quote funds (200 quote from matched trade)", async () => {
    console.log("\n>>>>>>>>>>>> Charlie settles 200 quote funds <<<<<<<<<<<<\n");

    const user = users.find((u) => u.name === "Charlie")!;
    const userWallet = user.wallet instanceof Keypair ? user.wallet : user.wallet.payer;
    const userPubkey = user.wallet instanceof Keypair
      ? user.wallet.publicKey
      : (user.wallet as anchor.Wallet).publicKey;

    // Get current state
    let openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    const quoteFree = Number(openOrders.quoteFree);
    
    console.log("Quote free before settle:", quoteFree);
    
    assert.equal(quoteFree, 200, "Charlie should have 200 quote free");

    // Capture balances before
    const quoteAccBefore = await getAccount(connection, (user as any).quoteVault);
    const quoteVaultBefore = await getAccount(connection, quoteVault);

    // Settle all 200 quote
    const tx = await program.methods
      .settleFunds(false, new anchor.BN(quoteFree))
      .accounts({
        signer: userPubkey,
        //@ts-ignore
        market: marketPda,
        openOrders: (user as any).openOrdersPda,
        baseVault,
        quoteVault,
        userBaseVault: (user as any).baseVault,
        userQuoteVault: (user as any).quoteVault,
      })
      .signers([userWallet])
      .rpc();

    await connection.confirmTransaction(tx);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Capture balances after
    const quoteAccAfter = await getAccount(connection, (user as any).quoteVault);
    const quoteVaultAfter = await getAccount(connection, quoteVault);
    openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);

    console.log("\n========== SETTLEMENT RESULTS ==========");
    console.log("Quote settled:", quoteFree);
    console.log("User quote: %d -> %d (change: +%d)", 
      Number(quoteAccBefore.amount), 
      Number(quoteAccAfter.amount),
      Number(quoteAccAfter.amount) - Number(quoteAccBefore.amount)
    );
    console.log("Market quote vault: %d -> %d (change: -%d)", 
      Number(quoteVaultBefore.amount), 
      Number(quoteVaultAfter.amount),
      Number(quoteVaultBefore.amount) - Number(quoteVaultAfter.amount)
    );
    console.log("Quote free after:", Number(openOrders.quoteFree));

    // Assertions
    assert.equal(
      Number(quoteAccAfter.amount) - Number(quoteAccBefore.amount),
      200,
      "Charlie should receive 200 quote"
    );
    assert.equal(
      Number(quoteVaultBefore.amount) - Number(quoteVaultAfter.amount),
      200,
      "Market vault should decrease by 200 quote"
    );
    assert.equal(
      Number(openOrders.quoteFree),
      0,
      "Quote free should be zero after settling"
    );

    console.log("\n✓ Transaction sig:", tx);
  });

  it("Should fail: Try to settle when balance is zero", async () => {
    console.log("\n>>>>>>>>>>>> Testing: Settle with zero balance <<<<<<<<<<<<\n");

    const user = users.find((u) => u.name === "Bob")!;
    const userWallet = user.wallet instanceof Keypair ? user.wallet : user.wallet.payer;
    const userPubkey = user.wallet instanceof Keypair
      ? user.wallet.publicKey
      : (user.wallet as anchor.Wallet).publicKey;

    let openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    console.log("Quote free:", Number(openOrders.quoteFree));

    try {
      await program.methods
        .settleFunds(false, new anchor.BN(100))
        .accounts({
          signer: userPubkey,
          //@ts-ignore
          market: marketPda,
          openOrders: (user as any).openOrdersPda,
          baseVault,
          quoteVault,
          userBaseVault: (user as any).baseVault,
          userQuoteVault: (user as any).quoteVault,
        })
        .signers([userWallet])
        .rpc();
      
      assert.fail("Should have thrown error");
    } catch (err: any) {
      console.log("✓ Error caught:", err.message);
      assert.include(err.message, "NoFundsToSettle");
    }
  });

  it("Final balances summary after settlements", async () => {
    console.log("\n>>>>>>>>>>>> FINAL BALANCES AFTER SETTLEMENTS <<<<<<<<<<<<\n");

    for (const user of users) {
      const baseAcc = await getAccount(connection, (user as any).baseVault);
      const quoteAcc = await getAccount(connection, (user as any).quoteVault);
      
      let openOrders = null;
      try {
        openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
      } catch {}

      console.log(`\n========== ${user.name} ==========`);
      console.log(`Wallet Balances:`);
      console.log(`  Base:  ${Number(baseAcc.amount)}`);
      console.log(`  Quote: ${Number(quoteAcc.amount)}`);
      
      if (openOrders) {
        console.log(`Open Orders:`);
        console.log(`  Base Free:    ${Number(openOrders.baseFree)}`);
        console.log(`  Base Locked:  ${Number(openOrders.baseLocked)}`);
        console.log(`  Quote Free:   ${Number(openOrders.quoteFree)}`);
        console.log(`  Quote Locked: ${Number(openOrders.quoteLocked)}`);
      }
    }

    const baseVaultFinal = await getAccount(connection, baseVault);
    const quoteVaultFinal = await getAccount(connection, quoteVault);
    console.log("\n========== Market Vaults ==========");
    console.log(`Base vault:  ${Number(baseVaultFinal.amount)}`);
    console.log(`Quote vault: ${Number(quoteVaultFinal.amount)}`);

    // Verify expected final state
    console.log("\n========== EXPECTED STATE VERIFICATION ==========");
    console.log("✓ Alice should have settled 2 base");
    console.log("✓ Alice still has 300 quote locked (unfilled bid)");
    console.log("✓ Bob has 3 base locked and 360 quote locked (both unfilled)");
    console.log("✓ Charlie should have settled 200 quote");
    console.log("✓ Market vaults should only contain locked funds");
  });
});

describe("Cancel Order Tests", () => {
  
  // Helper function to get order book and find user's orders
  async function getUserOrders(isBid: boolean) {
    const orderBookPda = isBid ? bidsPda : asksPda;
    const orderBook = await program.account.orderBook.fetch(orderBookPda);
    return orderBook.orders;
  }

  it("Alice cancels her remaining bid order (300 quote locked)", async () => {
    console.log("\n>>>>>>>>>>>> Alice cancels Bid order <<<<<<<<<<<<\n");

    const user = users.find((u) => u.name === "Alice")!;
    const userWallet = user.wallet instanceof Keypair ? user.wallet : user.wallet.payer;
    const userPubkey = user.wallet instanceof Keypair
      ? user.wallet.publicKey
      : (user.wallet as anchor.Wallet).publicKey;

    // Get Alice's orders from bids book
    const bidsOrders = await getUserOrders(true);
    const aliceOrder = bidsOrders.find((o: any) => o.owner.equals(userPubkey));
    
    console.log("Alice's bid orders:", bidsOrders.filter((o: any) => o.owner.equals(userPubkey)).length);
    
    if (!aliceOrder) {
      console.log("⚠ Alice has no bid orders to cancel");
      return;
    }

    console.log("Order ID:", aliceOrder.orderId.toString());
    console.log("Price:", aliceOrder.price.toString());
    console.log("Size:", aliceOrder.size.toString());

    // Get state before cancellation
    let openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    const quoteLockedBefore = Number(openOrders.quoteLocked);
    
    console.log("\nBefore cancellation:");
    console.log("  Quote locked:", quoteLockedBefore);

    const quoteAccBefore = await getAccount(connection, (user as any).quoteVault);
    const quoteVaultBefore = await getAccount(connection, quoteVault);

    // Cancel the order
    const tx = await program.methods
      .cancelOrder(aliceOrder.orderId, true) // true = is_bid
      .accounts({
        signer: userPubkey,
        //@ts-ignore
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        openOrders: (user as any).openOrdersPda,
        baseVault,
        quoteVault,
        userBaseVault: (user as any).baseVault,
        userQuoteVault: (user as any).quoteVault,
      })
      .signers([userWallet])
      .rpc();

    await connection.confirmTransaction(tx);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get state after cancellation
    openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    const quoteLockedAfter = Number(openOrders.quoteLocked);

    const quoteAccAfter = await getAccount(connection, (user as any).quoteVault);
    const quoteVaultAfter = await getAccount(connection, quoteVault);

    const refundAmount = Number(aliceOrder.price) * Number(aliceOrder.size);

    console.log("\n========== CANCELLATION RESULTS ==========");
    console.log("Refund amount:", refundAmount);
    console.log("User quote: %d -> %d (change: +%d)", 
      Number(quoteAccBefore.amount), 
      Number(quoteAccAfter.amount),
      Number(quoteAccAfter.amount) - Number(quoteAccBefore.amount)
    );
    console.log("Market quote vault: %d -> %d (change: -%d)", 
      Number(quoteVaultBefore.amount), 
      Number(quoteVaultAfter.amount),
      Number(quoteVaultBefore.amount) - Number(quoteVaultAfter.amount)
    );
    console.log("Quote locked: %d -> %d", quoteLockedBefore, quoteLockedAfter);

    // Assertions
    assert.equal(
      Number(quoteAccAfter.amount) - Number(quoteAccBefore.amount),
      refundAmount,
      "User should receive full refund"
    );
    assert.equal(
      Number(quoteVaultBefore.amount) - Number(quoteVaultAfter.amount),
      refundAmount,
      "Market vault should decrease by refund amount"
    );
    assert.equal(
      quoteLockedAfter,
      quoteLockedBefore - refundAmount,
      "Quote locked should decrease by refund amount"
    );

    // Verify order removed from order book
    const bidsOrdersAfter = await getUserOrders(true);
    const aliceOrderAfter = bidsOrdersAfter.find((o: any) => 
      o.owner.equals(userPubkey) && o.orderId.eq(aliceOrder.orderId)
    );
    assert.isUndefined(aliceOrderAfter, "Order should be removed from order book");

    console.log("\n✓ Transaction sig:", tx);
  });

  it("Bob cancels his ask order (3 base locked)", async () => {
    console.log("\n>>>>>>>>>>>> Bob cancels Ask order <<<<<<<<<<<<\n");

    const user = users.find((u) => u.name === "Bob")!;
    const userWallet = user.wallet instanceof Keypair ? user.wallet : user.wallet.payer;
    const userPubkey = user.wallet instanceof Keypair
      ? user.wallet.publicKey
      : (user.wallet as anchor.Wallet).publicKey;

    // Get Bob's orders from asks book
    const asksOrders = await getUserOrders(false);
    const bobOrder = asksOrders.find((o: any) => o.owner.equals(userPubkey));
    
    console.log("Bob's ask orders:", asksOrders.filter((o: any) => o.owner.equals(userPubkey)).length);
    
    if (!bobOrder) {
      console.log("⚠ Bob has no ask orders to cancel");
      return;
    }

    console.log("Order ID:", bobOrder.orderId.toString());
    console.log("Price:", bobOrder.price.toString());
    console.log("Size:", bobOrder.size.toString());

    // Get state before cancellation
    let openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    const baseLockedBefore = Number(openOrders.baseLocked);
    
    console.log("\nBefore cancellation:");
    console.log("  Base locked:", baseLockedBefore);

    const baseAccBefore = await getAccount(connection, (user as any).baseVault);
    const baseVaultBefore = await getAccount(connection, baseVault);

    // Cancel the order
    const tx = await program.methods
      .cancelOrder(bobOrder.orderId, false) // false = is_ask
      .accounts({
        signer: userPubkey,
        //@ts-ignore
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        openOrders: (user as any).openOrdersPda,
        baseVault,
        quoteVault,
        userBaseVault: (user as any).baseVault,
        userQuoteVault: (user as any).quoteVault,
      })
      .signers([userWallet])
      .rpc();

    await connection.confirmTransaction(tx);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get state after cancellation
    openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    const baseLockedAfter = Number(openOrders.baseLocked);

    const baseAccAfter = await getAccount(connection, (user as any).baseVault);
    const baseVaultAfter = await getAccount(connection, baseVault);

    const refundAmount = Number(bobOrder.size);

    console.log("\n========== CANCELLATION RESULTS ==========");
    console.log("Refund amount:", refundAmount);
    console.log("User base: %d -> %d (change: +%d)", 
      Number(baseAccBefore.amount), 
      Number(baseAccAfter.amount),
      Number(baseAccAfter.amount) - Number(baseAccBefore.amount)
    );
    console.log("Market base vault: %d -> %d (change: -%d)", 
      Number(baseVaultBefore.amount), 
      Number(baseVaultAfter.amount),
      Number(baseVaultBefore.amount) - Number(baseVaultAfter.amount)
    );
    console.log("Base locked: %d -> %d", baseLockedBefore, baseLockedAfter);

    // Assertions
    assert.equal(
      Number(baseAccAfter.amount) - Number(baseAccBefore.amount),
      refundAmount,
      "User should receive full refund"
    );
    assert.equal(
      Number(baseVaultBefore.amount) - Number(baseVaultAfter.amount),
      refundAmount,
      "Market vault should decrease by refund amount"
    );
    assert.equal(
      baseLockedAfter,
      baseLockedBefore - refundAmount,
      "Base locked should decrease by refund amount"
    );

    // Verify order removed from order book
    const asksOrdersAfter = await getUserOrders(false);
    const bobOrderAfter = asksOrdersAfter.find((o: any) => 
      o.owner.equals(userPubkey) && o.orderId.eq(bobOrder.orderId)
    );
    assert.isUndefined(bobOrderAfter, "Order should be removed from order book");

    console.log("\n✓ Transaction sig:", tx);
  });

  it("Bob cancels his bid order (360 quote locked)", async () => {
    console.log("\n>>>>>>>>>>>> Bob cancels Bid order <<<<<<<<<<<<\n");

    const user = users.find((u) => u.name === "Bob")!;
    const userWallet = user.wallet instanceof Keypair ? user.wallet : user.wallet.payer;
    const userPubkey = user.wallet instanceof Keypair
      ? user.wallet.publicKey
      : (user.wallet as anchor.Wallet).publicKey;

    // Get Bob's orders from bids book
    const bidsOrders = await getUserOrders(true);
    const bobOrder = bidsOrders.find((o: any) => o.owner.equals(userPubkey));
    
    console.log("Bob's bid orders:", bidsOrders.filter((o: any) => o.owner.equals(userPubkey)).length);
    
    if (!bobOrder) {
      console.log("⚠ Bob has no bid orders to cancel");
      return;
    }

    console.log("Order ID:", bobOrder.orderId.toString());
    console.log("Price:", bobOrder.price.toString());
    console.log("Size:", bobOrder.size.toString());

    // Get state before cancellation
    let openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    const quoteLockedBefore = Number(openOrders.quoteLocked);
    
    console.log("\nBefore cancellation:");
    console.log("  Quote locked:", quoteLockedBefore);

    const quoteAccBefore = await getAccount(connection, (user as any).quoteVault);
    const quoteVaultBefore = await getAccount(connection, quoteVault);

    // Cancel the order
    const tx = await program.methods
      .cancelOrder(bobOrder.orderId, true) // true = is_bid
      .accounts({
        signer: userPubkey,
        //@ts-ignore
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        openOrders: (user as any).openOrdersPda,
        baseVault,
        quoteVault,
        userBaseVault: (user as any).baseVault,
        userQuoteVault: (user as any).quoteVault,
      })
      .signers([userWallet])
      .rpc();

    await connection.confirmTransaction(tx);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get state after cancellation
    openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
    const quoteLockedAfter = Number(openOrders.quoteLocked);

    const quoteAccAfter = await getAccount(connection, (user as any).quoteVault);
    const quoteVaultAfter = await getAccount(connection, quoteVault);

    const refundAmount = Number(bobOrder.price) * Number(bobOrder.size);

    console.log("\n========== CANCELLATION RESULTS ==========");
    console.log("Refund amount:", refundAmount);
    console.log("User quote: %d -> %d (change: +%d)", 
      Number(quoteAccBefore.amount), 
      Number(quoteAccAfter.amount),
      Number(quoteAccAfter.amount) - Number(quoteAccBefore.amount)
    );
    console.log("Market quote vault: %d -> %d (change: -%d)", 
      Number(quoteVaultBefore.amount), 
      Number(quoteVaultAfter.amount),
      Number(quoteVaultBefore.amount) - Number(quoteVaultAfter.amount)
    );
    console.log("Quote locked: %d -> %d", quoteLockedBefore, quoteLockedAfter);

    // Assertions
    assert.equal(
      Number(quoteAccAfter.amount) - Number(quoteAccBefore.amount),
      refundAmount,
      "User should receive full refund"
    );
    assert.equal(
      Number(quoteVaultBefore.amount) - Number(quoteVaultAfter.amount),
      refundAmount,
      "Market vault should decrease by refund amount"
    );
    assert.equal(
      quoteLockedAfter,
      quoteLockedBefore - refundAmount,
      "Quote locked should decrease by refund amount"
    );

    // Verify order removed from order book
    const bidsOrdersAfter = await getUserOrders(true);
    const bobOrderAfter = bidsOrdersAfter.find((o: any) => 
      o.owner.equals(userPubkey) && o.orderId.eq(bobOrder.orderId)
    );
    assert.isUndefined(bobOrderAfter, "Order should be removed from order book");

    console.log("\n✓ Transaction sig:", tx);
  });

  it("Final balances after all cancellations", async () => {
    console.log("\n>>>>>>>>>>>> FINAL BALANCES AFTER CANCELLATIONS <<<<<<<<<<<<\n");

    for (const user of users) {
      const baseAcc = await getAccount(connection, (user as any).baseVault);
      const quoteAcc = await getAccount(connection, (user as any).quoteVault);
      
      let openOrders = null;
      try {
        openOrders = await program.account.openOrders.fetch((user as any).openOrdersPda);
      } catch {}

      console.log(`\n========== ${user.name} ==========`);
      console.log(`Wallet Balances:`);
      console.log(`  Base:  ${Number(baseAcc.amount)}`);
      console.log(`  Quote: ${Number(quoteAcc.amount)}`);
      
      if (openOrders) {
        console.log(`Open Orders:`);
        console.log(`  Base Free:    ${Number(openOrders.baseFree)}`);
        console.log(`  Base Locked:  ${Number(openOrders.baseLocked)}`);
        console.log(`  Quote Free:   ${Number(openOrders.quoteFree)}`);
        console.log(`  Quote Locked: ${Number(openOrders.quoteLocked)}`);
      }
    }

    const baseVaultFinal = await getAccount(connection, baseVault);
    const quoteVaultFinal = await getAccount(connection, quoteVault);
    console.log("\n========== Market Vaults ==========");
    console.log(`Base vault:  ${Number(baseVaultFinal.amount)}`);
    console.log(`Quote vault: ${Number(quoteVaultFinal.amount)}`);

    console.log("\n========== ORDER BOOKS ==========");
    const bidsBook = await program.account.orderBook.fetch(bidsPda);
    const asksBook = await program.account.orderBook.fetch(asksPda);
    console.log(`Bids remaining: ${bidsBook.orders.length}`);
    console.log(`Asks remaining: ${asksBook.orders.length}`);

    // Verify all orders are cancelled and all locked funds returned
    assert.equal(bidsBook.orders.length, 0, "All bids should be cancelled");
    assert.equal(asksBook.orders.length, 0, "All asks should be cancelled");
    assert.equal(Number(baseVaultFinal.amount), 0, "Base vault should be empty");
    assert.equal(Number(quoteVaultFinal.amount), 0, "Quote vault should be empty");

    console.log("\n✓ All orders cancelled successfully");
    console.log("✓ All locked funds returned to users");
    console.log("✓ Market vaults are empty");
  });
});


  async function logUserOpenOrdersState(userName: string, userPda: PublicKey) {
    try {
      const openOrdersAccount = await program.account.openOrders.fetch(userPda);
      console.log(`\n========== ${userName}'s Open Orders Data ==========`);
      console.log("Owner:", openOrdersAccount.owner.toBase58());
      console.log("Market:", openOrdersAccount.market.toBase58());
      console.log("Base Free:", openOrdersAccount.baseFree.toString());
      console.log("Base Locked:", openOrdersAccount.baseLocked.toString());
      console.log("Quote Free:", openOrdersAccount.quoteFree.toString());
      console.log("Quote Locked:", openOrdersAccount.quoteLocked.toString());
    } catch (error) {
      console.log(
        `${userName}'s OpenOrders account not found or not initialized yet`
      );
    }
  }
});

