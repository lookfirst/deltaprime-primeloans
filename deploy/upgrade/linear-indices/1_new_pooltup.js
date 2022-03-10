/** README
 * 1. Remove PoolTUP.json from deployments
 * 2. Set POOL_IMPLEMENTATION_ADDRESS
 */


import {embedCommitHash} from "../../../tools/scripts/embed-commit-hash";
import hre from 'hardhat'
import verifyContract from "../../../tools/scripts/verify-contract";


const POOL_IMPLEMENTATION_ADDRESS = "0x068cDA454f21381F4737C6518bD8c73860C56301"; //PoolWithAccessNFT


module.exports = async ({
  getNamedAccounts,
  deployments
}) => {
  const {deploy} = deployments;
  const {deployer, admin} = await getNamedAccounts();

  embedCommitHash('PoolTUP', './contracts/proxies');


  let result = await deploy('PoolTUP', {
    from: deployer,
    gasLimit: 8000000,
    args: [POOL_IMPLEMENTATION_ADDRESS, admin, []],
  });

  await verifyContract(hre, {
    address: result.address,
    contract: "contracts/proxies/PoolTUP.sol:PoolTUP",
    constructorArguments: [
        POOL_IMPLEMENTATION_ADDRESS,
        admin,
        []
    ]
  });

  console.log(`PoolTUP deployed at address: ${result.address}`);

};

module.exports.tags = ['pooltup'];
