const {embedCommitHash} = require("../../tools/scripts/embed-commit-hash");
import verifyContract from "../../tools/scripts/verify-contract";
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

    await verifyContract(hre, {
        address: '0x068cDA454f21381F4737C6518bD8c73860C56301',
        contract: "contracts/upgraded/PoolWithAccessNFT.sol:PoolWithAccessNFT"
    });
    //
    // console.log(`Deployed PoolWithAccessNFT implementation at address: ${result.address}`);
    //
    // result = await deploy('SmartLoansFactoryWithAccessNFT', {
    //     from: deployer,
    //     gasLimit: 8000000
    // });

    await verifyContract(hre, {
        address: '0x56e0F24C7d7c5A699FA5bd0656ebc9F6ADbd18cd'
    });

    // console.log(`Deployed SmartLoansFactoryWithAccessNFT implementation at address: ${result.address}`);
    //
    // result = await deploy('SmartLoanLimitedCollateral', {
    //     from: deployer,
    //     gasLimit: 8000000
    // });

    await verifyContract(hre, {
        address: '0x9f678aE8aAA5753a0847B5694160b8B41964d3A6'
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
