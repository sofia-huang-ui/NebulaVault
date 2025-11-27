import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div>
        <p className="header-pill">NebulaVault</p>
        <h1>Confidential staking for mETH & mUSDT</h1>
        <p>Fully homomorphic encryption keeps your balances private while smart contracts enforce the rules.</p>
      </div>
      <ConnectButton />
    </header>
  );
}
