# NebulaVault

NebulaVault is a confidential staking vault for encrypted mETH and mUSDT built on Zama's FHEVM. Users claim test assets, stake and unstake them with full on-chain privacy, and decrypt balances through the Zama relayer without ever exposing amounts in plaintext.

## Introduction
- Dual ERC7984 tokens (`ERC7984ETH`, `ERC7984USDT`) mint encrypted mETH/mUSDT via a faucet for fast onboarding.
- `NebulaVault` accepts either asset, tracks encrypted positions, and enforces operator approvals before moving funds.
- Hardhat tasks cover claiming, staking, unstaking, and decrypting stakes, making local and testnet usage consistent.
- The frontend (React + Vite + viem for reads, ethers for writes, RainbowKit for wallets) displays encrypted balances and requests decryptions through the relayer; it uses the generated ABIs from `deployments/sepolia` and avoids environment variables.

## Advantages
- End-to-end privacy: balances and stakes stay encrypted on-chain using FHE primitives; decryption happens client-side through the relayer.
- Safer transfers: ERC7984 operator checks prevent the vault from pulling funds unless explicitly approved.
- Dual-asset support: seamless handling of both mETH and mUSDT with the same staking flow.
- Developer-friendly tooling: Hardhat + TypeScript, hardhat-deploy, and repeatable tasks for faucet, stake, and decrypt.
- Production-minded frontend: no Tailwind or localstorage, Sepolia-first networking, wallet UX via RainbowKit.

## Problems We Solve
- Confidential DeFi positions: users can participate in staking without leaking balances or withdrawals to the public mempool.
- Simple FHE ergonomics: CLI tasks abstract encrypted inputs, proof handling, and decryption, reducing integration friction.
- Consistent testing-to-prod path: the same flows work against Hardhat nodes and Sepolia, with generated ABIs copied to the frontend.
- Operator-gated custody: prevents unauthorized vault pulls by requiring ERC7984 operator permissions before any transfer.

## Architecture
- Smart contracts
  - `ERC7984ETH` / `ERC7984USDT`: encrypted ERC7984 tokens with faucets minting 1 mETH and 1,000 mUSDT (6 decimals) to any address.
  - `NebulaVault`: accepts either token, updates encrypted stakes, and exposes encrypted totals; uses `FHESafeMath` for overflow-aware encrypted math.
- Deployment: `deploy/deploy.ts` deploys both tokens then wires the vault to their addresses.
- Tasks: `tasks/vault.ts` adds `task:addresses`, `task:claim`, `task:stake`, `task:unstake`, and `task:decrypt-stake`; `tasks/accounts.ts` lists signers.
- Frontend: `frontend/` targets Sepolia, reads with viem, writes with ethers, and keeps ABIs and addresses in `frontend/src/config/contracts.ts`; wallet config lives in `frontend/src/config/wagmi.ts`.
- Docs: Zama contract guidance in `docs/zama_llm.md`; relayer usage in `docs/zama_doc_relayer.md`.

## Tech Stack
- Solidity 0.8.27 with FHEVM libraries (`@fhevm/solidity`) and ERC7984 reference contracts.
- Hardhat, hardhat-deploy, TypeScript, ethers v6, viem, and the Zama Hardhat plugin for encrypted inputs.
- React + Vite + TypeScript + RainbowKit/wagmi; viem for reads and ethers for state changes.
- Relayer SDK (`@zama-fhe/relayer-sdk`) for encryption, proof handling, and user/public decryption.

## Getting Started
### Prerequisites
- Node.js 20+
- npm

### Install dependencies
```bash
npm install
```

### Environment
Create a `.env` file in the repo root:
```
INFURA_API_KEY=<your_infura_key>
PRIVATE_KEY=<hex_private_key_with_or_without_0x>
ETHERSCAN_API_KEY=<optional_for_verification>
```
Use a private key (no mnemonic). The config normalizes a missing `0x` prefix automatically.

### Compile, lint, and test
```bash
npm run compile
npm run lint
npm test
```

### Local network (for contract iteration)
```bash
npx hardhat node
npx hardhat deploy --network localhost
```

### Deploy to Sepolia
```bash
npx hardhat deploy --network sepolia
```
`hardhat-deploy` will emit addresses and write ABIs/artifacts to `deployments/sepolia`. Copy the generated ABIs into `frontend/src/config/contracts.ts` and update the `CONTRACT_ADDRESSES` object with the deployed values. Avoid environment variables in the frontend; keep these constants in the config file.

Optional verification:
```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Hardhat Tasks
All tasks default to the first signer. Add `--network sepolia` when targeting Sepolia.
```bash
# Print deployed contract addresses
npx hardhat task:addresses --network sepolia

# Claim faucet tokens
npx hardhat task:claim --asset meth --network sepolia
npx hardhat task:claim --asset musdt --recipient 0xYourAddr --network sepolia

# Stake or unstake (amount uses 6 decimals internally; CLI expects human-readable units)
npx hardhat task:stake --asset meth --amount 1.5 --network sepolia
npx hardhat task:unstake --asset musdt --amount 250 --network sepolia

# Decrypt your stake
npx hardhat task:decrypt-stake --asset meth --network sepolia
```

## Frontend Usage
- Install frontend deps: `cd frontend && npm install`.
- Set your WalletConnect `projectId` in `frontend/src/config/wagmi.ts`.
- Update `CONTRACT_ADDRESSES` and ABIs in `frontend/src/config/contracts.ts` with the generated values from `deployments/sepolia`; keep the file JSON-free and do not pull from environment variables.
- Run the app: `npm run dev` from `frontend/` (targets Sepolia; do not switch the dApp to localhost RPC).
- Features: claim mETH/mUSDT, view encrypted balances, decrypt balances through the relayer, stake/unstake via ethers write calls, and show encrypted totals via viem reads. No data is persisted to localstorage.

## Roadmap
- Add reward accrual and time-based bonuses on encrypted stakes.
- Support additional ERC7984 assets and dynamic fee schedules.
- Enhance frontend analytics (per-asset charts, decrypt-on-demand history) while keeping privacy constraints.
- Expand automated tests for cross-asset scenarios and edge-case ACL handling.
- Integrate monitoring for relayer availability and FHE oracle responses.

## License
BSD-3-Clause-Clear. See `LICENSE`.
