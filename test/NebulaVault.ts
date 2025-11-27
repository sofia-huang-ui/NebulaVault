import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ERC7984ETH, ERC7984USDT, NebulaVault } from "../types";

type Fixture = {
  meth: ERC7984ETH;
  musdt: ERC7984USDT;
  vault: NebulaVault;
  vaultAddress: string;
};

async function deployFixture(): Promise<Fixture> {
  const meth = (await (await ethers.getContractFactory("ERC7984ETH"))
    .deploy()) as ERC7984ETH;
  const musdt = (await (await ethers.getContractFactory("ERC7984USDT"))
    .deploy()) as ERC7984USDT;
  const vault = (await (await ethers.getContractFactory("NebulaVault"))
    .deploy(await meth.getAddress(), await musdt.getAddress())) as NebulaVault;

  return {
    meth,
    musdt,
    vault,
    vaultAddress: await vault.getAddress(),
  };
}

async function decryptBalance(
  tokenAddress: string,
  encryptedValue: string,
  signer: HardhatEthersSigner,
): Promise<number> {
  if (encryptedValue === ethers.ZeroHash) {
    return 0;
  }

  const clear = await fhevm.userDecryptEuint(FhevmType.euint64, encryptedValue, tokenAddress, signer);
  return Number(clear);
}

async function encryptAmount(contractAddress: string, owner: string, value: bigint) {
  return fhevm.createEncryptedInput(contractAddress, owner).add64(value).encrypt();
}

describe("NebulaVault", () => {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  before(async function () {
    const signers = await ethers.getSigners();
    [deployer, alice] = [signers[0], signers[1]];
  });

  beforeEach(function () {
    if (!fhevm.isMock) {
      console.warn("Skipping NebulaVault tests outside of FHEVM mock network");
      this.skip();
    }
  });

  it("mints faucet tokens with encrypted balances", async () => {
    const { meth } = await deployFixture();

    await meth.connect(deployer).faucet(alice.address);

    const encryptedBalance = await meth.confidentialBalanceOf(alice.address);
    const clearBalance = await decryptBalance(await meth.getAddress(), encryptedBalance, alice);

    expect(clearBalance).to.equal(1_000_000);
  });

  it("stakes and unstakes encrypted mETH", async () => {
    const { meth, vault, vaultAddress } = await deployFixture();

    await meth.connect(deployer).faucet(alice.address);

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    await meth.connect(alice).setOperator(vaultAddress, expiry);

    const half = 500_000n;
    const encryptedStake = await encryptAmount(vaultAddress, alice.address, half);
    await vault.connect(alice).stake(0, encryptedStake.handles[0], encryptedStake.inputProof);

    const encryptedVaultStake = await vault.getEncryptedStake(alice.address, 0);
    const clearVaultStake = await decryptBalance(vaultAddress, encryptedVaultStake, alice);
    expect(clearVaultStake).to.equal(Number(half));

    const encryptedWalletBalance = await meth.confidentialBalanceOf(alice.address);
    const clearWalletBalance = await decryptBalance(await meth.getAddress(), encryptedWalletBalance, alice);
    expect(clearWalletBalance).to.equal(500_000);

    const encryptedWithdraw = await encryptAmount(vaultAddress, alice.address, half);
    await vault.connect(alice).unstake(0, encryptedWithdraw.handles[0], encryptedWithdraw.inputProof);

    const encryptedVaultStakeAfter = await vault.getEncryptedStake(alice.address, 0);
    const clearVaultAfter = await decryptBalance(vaultAddress, encryptedVaultStakeAfter, alice);
    expect(clearVaultAfter).to.equal(0);

    const encryptedWalletAfter = await meth.confidentialBalanceOf(alice.address);
    const clearWalletAfter = await decryptBalance(await meth.getAddress(), encryptedWalletAfter, alice);
    expect(clearWalletAfter).to.equal(1_000_000);
  });
});
