import { useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';

import { Header } from './Header';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import {
  CONTRACT_ADDRESSES,
  ERC7984_ABI,
  NEBULA_VAULT_ABI,
} from '../config/contracts';
import '../styles/VaultApp.css';

type TokenKey = 'meth' | 'musdt';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const TOKEN_CONFIG: Record<TokenKey, {
  label: string;
  description: string;
  faucetHint: string;
  assetIndex: number;
  address: `0x${string}`;
}> = {
  meth: {
    label: 'mETH',
    description: 'Confidential ETH twin minted inside NebulaVault.',
    faucetHint: 'Mints 1.0 mETH (10^6 base units).',
    assetIndex: 0,
    address: CONTRACT_ADDRESSES.meth,
  },
  musdt: {
    label: 'mUSDT',
    description: 'Encrypted stablecoin backed by the vault.',
    faucetHint: 'Mints 1000 mUSDT for quick testing.',
    assetIndex: 1,
    address: CONTRACT_ADDRESSES.musdt,
  },
};

const DECIMALS = 1_000_000n;

const initialForms = {
  meth: { stake: '', unstake: '' },
  musdt: { stake: '', unstake: '' },
};

export function VaultApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const addressesReady = Object.values(CONTRACT_ADDRESSES).every((value) => value !== ZERO_ADDRESS);

  const [forms, setForms] = useState<typeof initialForms>(() => initialForms);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({});
  const [decryptingKey, setDecryptingKey] = useState<string | null>(null);

  const methBalance = useReadContract({
    address: TOKEN_CONFIG.meth.address,
    abi: ERC7984_ABI,
    functionName: 'confidentialBalanceOf',
    args: address && addressesReady ? [address] : undefined,
    query: { enabled: !!address && addressesReady },
  });

  const musdtBalance = useReadContract({
    address: TOKEN_CONFIG.musdt.address,
    abi: ERC7984_ABI,
    functionName: 'confidentialBalanceOf',
    args: address && addressesReady ? [address] : undefined,
    query: { enabled: !!address && addressesReady },
  });

  const methStake = useReadContract({
    address: CONTRACT_ADDRESSES.vault,
    abi: NEBULA_VAULT_ABI,
    functionName: 'getEncryptedStake',
    args: address && addressesReady ? [address, TOKEN_CONFIG.meth.assetIndex] : undefined,
    query: { enabled: !!address && addressesReady },
  });

  const musdtStake = useReadContract({
    address: CONTRACT_ADDRESSES.vault,
    abi: NEBULA_VAULT_ABI,
    functionName: 'getEncryptedStake',
    args: address && addressesReady ? [address, TOKEN_CONFIG.musdt.assetIndex] : undefined,
    query: { enabled: !!address && addressesReady },
  });

  const methOperator = useReadContract({
    address: TOKEN_CONFIG.meth.address,
    abi: ERC7984_ABI,
    functionName: 'isOperator',
    args: address && addressesReady ? [address, CONTRACT_ADDRESSES.vault] : undefined,
    query: { enabled: !!address && addressesReady },
  });

  const musdtOperator = useReadContract({
    address: TOKEN_CONFIG.musdt.address,
    abi: ERC7984_ABI,
    functionName: 'isOperator',
    args: address && addressesReady ? [address, CONTRACT_ADDRESSES.vault] : undefined,
    query: { enabled: !!address && addressesReady },
  });

  const tokenState: Record<TokenKey, {
    balance: string | undefined;
    stake: string | undefined;
    isOperator: boolean;
  }> = {
    meth: {
      balance: methBalance.data as string | undefined,
      stake: methStake.data as string | undefined,
      isOperator: Boolean(methOperator.data),
    },
    musdt: {
      balance: musdtBalance.data as string | undefined,
      stake: musdtStake.data as string | undefined,
      isOperator: Boolean(musdtOperator.data),
    },
  };

  const handleInputChange = (token: TokenKey, field: 'stake' | 'unstake', value: string) => {
    setForms((prev) => ({
      ...prev,
      [token]: {
        ...prev[token],
        [field]: value,
      },
    }));
  };

  const parseToUnits = (value: string): bigint => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error('Enter a positive amount');
    }
    const scaled = BigInt(Math.floor(numeric * Number(DECIMALS)));
    if (scaled <= 0n) {
      throw new Error('Value is too small');
    }
    return scaled;
  };

  const withStatus = async (actionKey: string, action: () => Promise<void>) => {
    try {
      setPendingAction(actionKey);
      setStatusMessage('');
      await action();
      setStatusMessage('Request submitted to the network. Waiting for confirmation...');
    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setPendingAction(null);
    }
  };

  const buildTokenContract = async (token: TokenKey) => {
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Connect your wallet to continue');
    }
    if (TOKEN_CONFIG[token].address === ZERO_ADDRESS) {
      throw new Error('Token address is not configured');
    }
    return new Contract(TOKEN_CONFIG[token].address, ERC7984_ABI, signer);
  };

  const buildVaultContract = async () => {
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Connect your wallet to continue');
    }
    if (CONTRACT_ADDRESSES.vault === ZERO_ADDRESS) {
      throw new Error('Vault address is not configured');
    }
    return new Contract(CONTRACT_ADDRESSES.vault, NEBULA_VAULT_ABI, signer);
  };

  const encryptAmount = async (value: bigint) => {
    if (!instance || !address) {
      throw new Error('Encryption service is not ready');
    }
    if (!addressesReady) {
      throw new Error('Contracts are not configured');
    }
    const input = instance.createEncryptedInput(CONTRACT_ADDRESSES.vault, address);
    input.add64(value);
    return input.encrypt();
  };

  const claimTokens = (token: TokenKey) =>
    withStatus(`claim-${token}`, async () => {
    if (!addressesReady) {
      throw new Error('Set deployed contract addresses before minting');
    }
    const contract = await buildTokenContract(token);
      const tx = await contract.faucet(address);
      await tx.wait();
      setStatusMessage(`${TOKEN_CONFIG[token].label} minted successfully`);
    });

  const approveVault = (token: TokenKey) =>
    withStatus(`approve-${token}`, async () => {
    if (!addressesReady) {
      throw new Error('Set deployed contract addresses before approving the vault');
    }
    const contract = await buildTokenContract(token);
      const now = Math.floor(Date.now() / 1000);
      const expiry = now + 30 * 24 * 60 * 60;
      const tx = await contract.setOperator(CONTRACT_ADDRESSES.vault, expiry);
      await tx.wait();
      setStatusMessage(`Vault approved to move ${TOKEN_CONFIG[token].label}`);
    });

  const stakeTokens = (token: TokenKey) =>
    withStatus(`stake-${token}`, async () => {
    if (!addressesReady) {
      throw new Error('Set deployed contract addresses before staking');
    }
    const amount = parseToUnits(forms[token].stake);
      const encrypted = await encryptAmount(amount);
      const vault = await buildVaultContract();
      const tx = await vault.stake(
        TOKEN_CONFIG[token].assetIndex,
        encrypted.handles[0],
        encrypted.inputProof,
      );
      await tx.wait();
      setForms((prev) => ({ ...prev, [token]: { ...prev[token], stake: '' } }));
      setStatusMessage(`Staked ${TOKEN_CONFIG[token].label}`);
    });

  const unstakeTokens = (token: TokenKey) =>
    withStatus(`unstake-${token}`, async () => {
    if (!addressesReady) {
      throw new Error('Set deployed contract addresses before unstaking');
    }
    const amount = parseToUnits(forms[token].unstake);
      const encrypted = await encryptAmount(amount);
      const vault = await buildVaultContract();
      const tx = await vault.unstake(
        TOKEN_CONFIG[token].assetIndex,
        encrypted.handles[0],
        encrypted.inputProof,
      );
      await tx.wait();
      setForms((prev) => ({ ...prev, [token]: { ...prev[token], unstake: '' } }));
      setStatusMessage(`Unstaked ${TOKEN_CONFIG[token].label}`);
    });

  const decryptEncryptedValue = async (
    handle: string | undefined,
    contractAddress: string,
    cacheKey: string,
  ) => {
    if (!instance || !address) {
      setStatusMessage('Encryption service is not ready');
      return;
    }
    if (!addressesReady) {
      setStatusMessage('Contracts are not configured');
      return;
    }
    if (!handle) {
      setStatusMessage('Nothing to decrypt yet');
      return;
    }

    try {
      setDecryptingKey(cacheKey);
      const pair = [{ handle, contractAddress }];
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '5';
      const contractAddresses = [contractAddress];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays,
      );

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Connect wallet to decrypt');
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        pair,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decrypted = result[handle] || '0';
      const formatted = (Number(decrypted) / Number(DECIMALS)).toFixed(6);
      setDecryptedValues((prev) => ({ ...prev, [cacheKey]: formatted }));
    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : 'Failed to decrypt value');
    } finally {
      setDecryptingKey(null);
    }
  };

  const renderEncryptedValue = (value?: string) => {
    if (!value) {
      return 'Not initialized';
    }
    return `${value.slice(0, 10)}…`;
  };

  const renderDecryptedValue = (key: string) => {
    if (decryptingKey === key) {
      return 'Decrypting...';
    }
    if (decryptedValues[key]) {
      return `${decryptedValues[key]} tokens`;
    }
    return 'Hidden until decrypted';
  };

  return (
    <div className="vault-app">
      <Header />
      <main className="vault-main">
        <div className="intro-card">
          <div>
            <p className="intro-pill">Zama FHE Powered</p>
            <h2>Stake privately, earn transparently.</h2>
            <p>
              Claim encrypted assets, keep balances confidential, and move liquidity through NebulaVault
              without exposing your numbers on-chain.
            </p>
          </div>
          <div className="intro-status">
            <span className={`dot ${instance && !zamaLoading ? 'online' : 'offline'}`}></span>
            <p>{zamaLoading ? 'Initializing encryption service...' : zamaError ? zamaError : 'Encryption ready'}</p>
          </div>
        </div>

        {statusMessage && <div className="status-banner">{statusMessage}</div>}

        {!addressesReady && (
          <div className="notice-card">
            <p>
              Contract addresses are not configured. Update <code>CONTRACT_ADDRESSES</code> in
              <code>frontend/src/config/contracts.ts</code> after deploying to Sepolia.
            </p>
          </div>
        )}

        {!address && (
          <div className="notice-card">
            <p>Connect your wallet to start claiming tokens and staking.</p>
          </div>
        )}

        <section className="token-grid">
          {(Object.keys(TOKEN_CONFIG) as TokenKey[]).map((token) => (
            <div key={token} className="token-card">
              <div className="token-card-header">
                <div>
                  <h3>{TOKEN_CONFIG[token].label}</h3>
                  <p>{TOKEN_CONFIG[token].description}</p>
                </div>
                <button
                  className="link-button"
                  onClick={() => claimTokens(token)}
                  disabled={!address || !addressesReady || pendingAction === `claim-${token}`}
                >
                  {pendingAction === `claim-${token}` ? 'Minting...' : 'Claim'}
                </button>
              </div>
              <p className="token-hint">{TOKEN_CONFIG[token].faucetHint}</p>
              <div className="token-balance">
                <label>Encrypted wallet balance</label>
                <span>{renderEncryptedValue(tokenState[token].balance)}</span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    decryptEncryptedValue(
                      tokenState[token].balance,
                      TOKEN_CONFIG[token].address,
                      `wallet-${token}`,
                    )
                  }
                  disabled={!address || !addressesReady || zamaLoading || decryptingKey === `wallet-${token}`}
                >
                  Decrypt balance
                </button>
                <p className="decrypted-value">{renderDecryptedValue(`wallet-${token}`)}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="stake-grid">
          {(Object.keys(TOKEN_CONFIG) as TokenKey[]).map((token) => (
            <div key={`stake-${token}`} className="stake-card">
              <div className="stake-header">
                <div>
                  <h3>{TOKEN_CONFIG[token].label} staking</h3>
                  <p>Manage encrypted deposits without exposing amounts on-chain.</p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => approveVault(token)}
                  disabled={
                    !addressesReady ||
                    tokenState[token].isOperator ||
                    pendingAction === `approve-${token}`
                  }
                >
                  {tokenState[token].isOperator ? 'Approved' : pendingAction === `approve-${token}` ? 'Approving...' : 'Approve vault'}
                </button>
              </div>
              <div className="stake-balance">
                <label>Encrypted staked balance</label>
                <span>{renderEncryptedValue(tokenState[token].stake)}</span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    decryptEncryptedValue(
                      tokenState[token].stake,
                      CONTRACT_ADDRESSES.vault,
                      `stake-${token}`,
                    )
                  }
                  disabled={!address || !addressesReady || zamaLoading || decryptingKey === `stake-${token}`}
                >
                  Reveal stake
                </button>
                <p className="decrypted-value">{renderDecryptedValue(`stake-${token}`)}</p>
              </div>

              <div className="form-row">
                <div>
                  <label>Stake amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.000001"
                    value={forms[token].stake}
                    onChange={(e) => handleInputChange(token, 'stake', e.target.value)}
                    placeholder="0.0"
                  />
                </div>
                <button
                  className="primary-button"
                  onClick={() => stakeTokens(token)}
                  disabled={
                    !address ||
                    !addressesReady ||
                    !tokenState[token].isOperator ||
                    !forms[token].stake ||
                    zamaLoading ||
                    pendingAction === `stake-${token}`
                  }
                >
                  {pendingAction === `stake-${token}` ? 'Submitting...' : 'Stake'}
                </button>
              </div>

              <div className="form-row">
                <div>
                  <label>Unstake amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.000001"
                    value={forms[token].unstake}
                    onChange={(e) => handleInputChange(token, 'unstake', e.target.value)}
                    placeholder="0.0"
                  />
                </div>
                <button
                  className="ghost-button"
                  onClick={() => unstakeTokens(token)}
                  disabled={
                    !address ||
                    !addressesReady ||
                    !tokenState[token].isOperator ||
                    !forms[token].unstake ||
                    zamaLoading ||
                    pendingAction === `unstake-${token}`
                  }
                >
                  {pendingAction === `unstake-${token}` ? 'Submitting...' : 'Unstake'}
                </button>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
