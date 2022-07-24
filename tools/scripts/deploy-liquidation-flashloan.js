const { ethers } = require("hardhat");
import PANGOLIN_EXCHANGETUP from '../../deployments/mainnet/PangolinExchangeTUP.json'

const pangolinRouterAddress = '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106';
const aavePoolAddressesProviderAdress = '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb';

async function deployLiquidationFlashloanContract(loanAddress) {
    const Contract = await ethers.getContractFactory("LiquidationFlashloan");
    const contract = await Contract.deploy(aavePoolAddressesProviderAdress, 
        loanAddress, 
        pangolinRouterAddress, 
        PANGOLIN_EXCHANGETUP.address);
    console.log("Contract deployed to:", contract.address);
    return contract;
}

export async function deployLiquidationFlashloan(loanAddress) {
   return deployLiquidationFlashloanContract(loanAddress)
    .then((contract) => contract)
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
}