# 🚀 RapidFlow - Central Limit Order Book

A decentralized Central Limit Order Book (CLOB) built on Solana using Anchor framework. Part of the Q4 Turbin3 Capstone Project.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?logo=solana)](https://explorer.solana.com/address/7ssJMQw9tFamJcsdxuaEwM6iKF7LS3e2ypNNFKRcLHjA?cluster=devnet)

## 🌟 What is RapidFlow?

RapidFlow is a decentralized exchange (DEX) protocol that implements a traditional order book matching engine on-chain. Unlike Automated Market Makers (AMMs), our CLOB provides:

- **Price Discovery**: True market-driven pricing through order matching
- **Zero Slippage**: For limit orders within the book
- **Capital Efficiency**: No need for large liquidity pools
- **Professional Trading**: Familiar interface for traditional traders

## 📌 Devnet Deployment

**Program ID**: `7ssJMQw9tFamJcsdxuaEwM6iKF7LS3e2ypNNFKRcLHjA`

[View on Solana Explorer](https://explorer.solana.com/address/7ssJMQw9tFamJcsdxuaEwM6iKF7LS3e2ypNNFKRcLHjA?cluster=devnet)

## ✨ Features

### Core Functionality

- 📖 **On-chain Order Book** - Fully decentralized bid/ask management
- 🎯 **Order Types** - Limit orders and market orders support
- ⚡ **Price-Time Priority** - Fair matching engine following traditional exchange rules
- ✍️ **Order Management** - Place, modify, and cancel orders seamlessly
- 🔄 **Flexible Fill Logic** - Support for partial and full order fills
- 💰 **Fee Structure** - Built-in maker/taker fees with rebate system
- 🔒 **Secure** - Audited smart contracts with comprehensive test coverage

### Technical Highlights

- Built with Anchor framework for type safety
- Optimized for Solana's high throughput
- Efficient state management and rent optimization
- Comprehensive error handling

## 🏗️ Architecture

The protocol consists of several key components:

### State Accounts

- **Market**: Main market state storing authority, token mints (base/quote), vaults, and references to bid/ask order books
- **OrderBook**: Stores all orders for one side of the market (bids or asks) with price-time priority
- **Order**: Individual order data containing order ID, owner, price, size, and timestamp
- **OpenOrders**: Tracks user's locked and free balances for both base and quote tokens in a specific market

### Core Instructions

1. **Initialize Market** - Create a new trading pair
2. **Place Order** - Add limit or market orders to the book
3. **Cancel Order** - Remove unfilled orders
4. **Settle Funds** - Withdraw filled order proceeds

[📄 View Detailed Architecture Design](./Assignment_3:_Architecture_Design.pdf)

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (v1.17+)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (v0.29+)
- [Node.js](https://nodejs.org/) (v18+) & npm/yarn

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/bytehash69/rapid-flow.git
cd rapid-flow
```

2. **Install dependencies**

```bash
yarn install
```

3. **Build the program**

```bash
anchor build
```

4. **Run tests**

```bash
anchor test
```

### Deployment

To deploy to devnet:

```bash
anchor deploy --provider.cluster devnet
```

To deploy to mainnet-beta:

```bash
anchor deploy --provider.cluster mainnet-beta
```

## 📁 Project Structure

```
rapid-flow/
├── programs/
│   └── rapid-flow/
│       ├── src/
│       │   ├── instructions/      # Instruction handlers
│       │   │   ├── initialize.rs
│       │   │   ├── place_order.rs
│       │   │   ├── cancel_order.rs
│       │   │   └── settle_funds.rs
│       │   ├── state/            # State structs and logic
│       │   │   ├── order_book.rs
│       │   │   ├── order.rs
│       │   │   └── error.rs
│       │   └── lib.rs            # Program entrypoint
│       └── Cargo.toml
├── tests/
│   └── rapid-flow.ts            # Integration tests
├── Anchor.toml                  # Anchor configuration
└── package.json
```

## 🧪 Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
anchor test

# Run specific test file
anchor test tests/rapid-flow.ts
```

### Test Coverage

- ✅ Market initialization
- ✅ Order placement (limit & market)
- ✅ Order matching logic
- ✅ Partial fills
- ✅ Order cancellation
- ✅ Fee calculation
- ✅ Fund settlement
- ✅ Edge cases and error conditions

## 👥 Team

- [@bytehash69](https://github.com/bytehash69) - Core Developer
- [@Vdkk07](https://github.com/Vdkk07) - Core Developer

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ on Solana**
