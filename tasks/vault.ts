import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

enum AssetFlag {
  METH = 0,
  MUSDT = 1,
}

function parseAsset(asset: string): AssetFlag {
  if (asset.toLowerCase() === "meth") {
    return AssetFlag.METH;
  }
  if (asset.toLowerCase() === "musdt") {
    return AssetFlag.MUSDT;
  }
  throw new Error("asset must be either meth or musdt");
}

task("task:addresses", "Print deployed token and vault addresses").setAction(async function (_args, hre) {
  const meth = await hre.deployments.get("ERC7984ETH");
  const musdt = await hre.deployments.get("ERC7984USDT");
  const vault = await hre.deployments.get("NebulaVault");

  console.log(`mETH  : ${meth.address}`);
  console.log(`mUSDT : ${musdt.address}`);
  console.log(`Vault : ${vault.address}`);
});

task("task:claim", "Mint faucet tokens")
  .addParam("asset", "Asset to claim: meth or musdt")
  .addOptionalParam("recipient", "Recipient address (defaults to first signer)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const asset = parseAsset(taskArguments.asset as string);
    const signers = await ethers.getSigners();
    const recipient = (taskArguments.recipient as string | undefined) ?? signers[0].address;
    const contractName = asset === AssetFlag.METH ? "ERC7984ETH" : "ERC7984USDT";
    const deployment = await deployments.get(contractName);
    const token = await ethers.getContractAt(contractName, deployment.address);

    const tx = await token.connect(signers[0]).faucet(recipient);
    console.log(`Minting ${contractName} to ${recipient}. tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:stake", "Stake encrypted tokens into NebulaVault")
  .addParam("asset", "Asset to stake: meth or musdt")
  .addParam("amount", "Token amount in human-readable units (e.g. 1.5)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const asset = parseAsset(taskArguments.asset as string);
    const amount = parseFloat(taskArguments.amount as string);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("amount must be a positive number");
    }

    const vaultDeployment = await deployments.get("NebulaVault");
    const vault = await ethers.getContractAt("NebulaVault", vaultDeployment.address);
    const [signer] = await ethers.getSigners();

    const scaled = BigInt(Math.floor(amount * 1_000_000));

    const encrypted = await fhevm
      .createEncryptedInput(vaultDeployment.address, signer.address)
      .add64(scaled)
      .encrypt();

    const tx = await vault
      .connect(signer)
      .stake(asset, encrypted.handles[0], encrypted.inputProof);

    console.log(`Staking ${amount} tokens. tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:unstake", "Withdraw encrypted tokens from NebulaVault")
  .addParam("asset", "Asset to unstake: meth or musdt")
  .addParam("amount", "Token amount in human-readable units (e.g. 1.5)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const asset = parseAsset(taskArguments.asset as string);
    const amount = parseFloat(taskArguments.amount as string);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("amount must be a positive number");
    }

    const vaultDeployment = await deployments.get("NebulaVault");
    const vault = await ethers.getContractAt("NebulaVault", vaultDeployment.address);
    const [signer] = await ethers.getSigners();

    const scaled = BigInt(Math.floor(amount * 1_000_000));

    const encrypted = await fhevm
      .createEncryptedInput(vaultDeployment.address, signer.address)
      .add64(scaled)
      .encrypt();

    const tx = await vault
      .connect(signer)
      .unstake(asset, encrypted.handles[0], encrypted.inputProof);

    console.log(`Unstaking ${amount} tokens. tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:decrypt-stake", "Decrypt the caller's encrypted stake")
  .addParam("asset", "Asset to inspect: meth or musdt")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm, deployments } = hre;
    const asset = parseAsset(taskArguments.asset as string);
    const vaultDeployment = await deployments.get("NebulaVault");
    const [signer] = await ethers.getSigners();
    const vault = await ethers.getContractAt("NebulaVault", vaultDeployment.address);

    const encryptedStake = await vault.getEncryptedStake(signer.address, asset);
    if (encryptedStake === ethers.ZeroHash) {
      console.log("Encrypted stake is empty");
      return;
    }

    const clear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedStake,
      vaultDeployment.address,
      signer,
    );

    console.log(`Decrypted stake: ${Number(clear) / 1_000_000} tokens`);
  });
