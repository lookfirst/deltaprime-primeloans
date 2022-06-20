import verifyContract from "../tools/scripts/verify-contract";
import {ethers} from "hardhat";
import {embedCommitHash} from "../tools/scripts/embed-commit-hash";
import {renameSync} from "fs";
const hre = require("hardhat");
const networkName = hre.network.name

module.exports = async ({
    getNamedAccounts,
    deployments
}) => {
    const {deploy} = deployments;
    const {deployer, admin} = await getNamedAccounts();

    embedCommitHash('WavaxBorrowIndex');
    embedCommitHash('WavaxDepositIndex');
    embedCommitHash('UsdcBorrowIndex');
    embedCommitHash('UsdcDepositIndex');

    await deployLinearIndex("WavaxBorrowIndex", "WavaxPoolTUP", deploy, deployer, admin);
    await deployLinearIndex("WavaxDepositIndex", "WavaxPoolTUP", deploy, deployer, admin);
    await deployLinearIndex("UsdcBorrowIndex", "UsdcPoolTUP", deploy, deployer, admin);
    await deployLinearIndex("UsdcDepositIndex", "UsdcPoolTUP", deploy, deployer, admin);

};

async function deployLinearIndex(name, poolTup, deploy, deployer, admin) {
    const poolTUP = await ethers.getContract(poolTup);

    let resultIndex = await deploy(name, {
        from: deployer,
        gasLimit: 8000000,
        args: [],
    });

    await verifyContract(hre, {
        address: resultIndex.address,
        constructorArguments: []
    })

    console.log(`Deployed linear index at address: ${resultIndex.address}`);

    let result = await deploy(`${name}TUP`, {
        from: deployer,
        gasLimit: 8000000,
        args: [resultIndex.address, admin, []],
    });

    await verifyContract(hre, {
        address: result.address,
        contract: `contracts/proxies/${name}TUP.sol:${name}TUP`,
        constructorArguments: [
            resultIndex.address,
            admin,
            []
        ]
    });

    console.log(`${name}TUP deployed at address: ${result.address}`);

    renameSync(`./deployments/${networkName}/${name}TUP.json`, `./deployments/${networkName}/${name}TUP.json`);

    const index = await ethers.getContractFactory(name);

    let initializeTx = await index.attach(result.address).initialize(
        poolTUP.address,
        { gasLimit: 8000000 }
    );

    await initializeTx.wait();
}

module.exports.tags = ['init'];
