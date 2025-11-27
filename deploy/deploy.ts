import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const meth = await deploy("ERC7984ETH", {
    from: deployer,
    log: true,
  });

  const musdt = await deploy("ERC7984USDT", {
    from: deployer,
    log: true,
  });

  const vault = await deploy("NebulaVault", {
    from: deployer,
    args: [meth.address, musdt.address],
    log: true,
  });

  console.log(`mETH token    : ${meth.address}`);
  console.log(`mUSDT token   : ${musdt.address}`);
  console.log(`NebulaVault   : ${vault.address}`);
};
export default func;
func.id = "deploy_nebula_vault";
func.tags = ["NebulaVault"];
