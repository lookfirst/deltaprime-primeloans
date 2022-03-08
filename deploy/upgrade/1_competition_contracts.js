import {ethers} from "hardhat";

const {embedCommitHash} = require("../../tools/scripts/embed-commit-hash");
import verifyContract from "../../tools/scripts/verify-contract";
import web3Abi from "web3-eth-abi";
const hre = require("hardhat");
module.exports = async ({
    getNamedAccounts,
    deployments
}) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    // embedCommitHash('PoolWithAccessNFT', './contracts/upgraded');
    // embedCommitHash('SmartLoansFactoryWithAccessNFT', './contracts/upgraded');
    // embedCommitHash('SmartLoanLimitedCollateral', './contracts/upgraded');
    // embedCommitHash('BorrowAccessNFT', './contracts/ERC721');
    // embedCommitHash('DepositAccessNFT', './contracts/ERC721');

    // let result = await deploy('PoolWithAccessNFT', {
    //     from: deployer,
    //     gasLimit: 8000000
    // });

    // await verifyContract(hre, {
    //     address: '0x068cDA454f21381F4737C6518bD8c73860C56301',
    //     contract: "contracts/upgraded/PoolWithAccessNFT.sol:PoolWithAccessNFT"
    // });
    // //
    // console.log(`Deployed PoolWithAccessNFT implementation at address: ${result.address}`);
    //
    // result = await deploy('SmartLoansFactoryWithAccessNFT', {
    //     from: deployer,
    //     gasLimit: 8000000
    // });
    //
    // await verifyContract(hre, {
    //     address: '0xE33A31841bF8aAA6b4be05C1822161671c1A3641'
    //     0xC2A4a97E20f2F103FB51A266814F013Dca6fA27f
    // });


    // const initializeInterface =   {
    //     "inputs": [
    //         {
    //             "internalType": "contract SmartLoan",
    //             "name": "_smartLoanImplementation",
    //             "type": "address"
    //         }
    //     ],
    //     "name": "initialize",
    //     "outputs": [],
    //     "stateMutability": "nonpayable",
    //     "type": "function"
    // };
    //
    // const calldata = web3Abi.encodeFunctionCall(
    //     initializeInterface,
    //     ['0x7e5977eb2813011e2475fCAf42a5b541217a611f']
    // )
    //
    // await verifyContract(hre, {
    //     address: '0x42ccEc34399Ea11B86bA7c2203Fc4647C845a5C1',
    //     contract: "contracts/proxies/SmartLoansFactoryTUP.sol:SmartLoansFactoryTUP",
    //     constructorArguments: [
    //         '0xE33A31841bF8aAA6b4be05C1822161671c1A3641',
    //         '0xC29ee4509F01e3534307645Fc62F30Da3Ec65751',
    //         calldata
    //     ]
    // })

    // console.log(`Deployed SmartLoansFactoryWithAccessNFT implementation at address: ${result.address}`);
    //
    // result = await deploy('SmartLoanLimitedCollateral', {
    //     from: deployer,
    //     gasLimit: 8000000
    // });

    // await verifyContract(hre, {
    //     address: '0x86a83e2b95f8d5f02d44a9578de6089f48b278db',
    //     constructorArguments: [
    //         "0xC2A4a97E20f2F103FB51A266814F013Dca6fA27f",
    //         "0x8129fc1c"
    //     ]
    // });

    await verifyContract(hre, {
        address: '0xF188D349Ee9279C5EAdd3C06aE0ff089A97d92db',
        constructorArguments: [
            '0xDF83DC5a11EE4a176264FaE1146406295eb6e18D'
        ]
    });

    await verifyContract(hre, {
        address: '0x9015B8f453f58F8c0c8F9012C709450F600B6Df4',
        constructorArguments: [
            '0xDF83DC5a11EE4a176264FaE1146406295eb6e18D'
        ]
    });

    // console.log(`Deployed SmartLoanLimitedCollateral implementation at address: ${result.address}`);
    //
    // result = await deploy('BorrowAccessNFT', {
    //     from: deployer,
    //     gasLimit: 8000000
    // });

    // await verifyContract(hre, {
    //     address: result.address,
    //     contract: "contracts/ERC721/BorrowAccessNFT.sol:BorrowAccessNFT"
    // });

    // console.log(`Deployed BorrowAccessNFT at address: ${result.address}`);
    //
    // result = await deploy('DepositAccessNFT', {
    //     from: deployer,
    //     gasLimit: 8000000
    // });

    // await verifyContract(hre, {
    //     address: result.address,
    //     contract: "contracts/ERC721/DepositAccessNFT.sol:DepositAccessNFT"
    // });

    // console.log(`Deployed DepositAccessNFT at address: ${result.address}`);

};

module.exports.tags = ['competition'];
