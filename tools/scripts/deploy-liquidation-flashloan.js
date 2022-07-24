const { ethers } = require("hardhat");
import PANGOLIN_EXCHANGETUP from '../../deployments/mainnet/PangolinExchangeTUP.json'

const loanAddress = '0xf3cdfA877bB0615b50D066e41404668f016feE1E' //todo: temp factory address, make
const pangolinRouterAddress = '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106';
const aavePoolAddressesProviderAdress = '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb';

async function deployLiquidationFlashloanContract(contractName, a, b, c, d) {
    // We get the name of contract to deploy
    const Contract = await ethers.getContractFactory(contractName);
    console.log(a, b, c, d);
    const contract = await Contract.deploy(a, b, c, d);
    
    console.log("Contract deployed to:", contract.address);
}

function deployLiquidationFlashloan(name, a, b, c, d) {
    deployLiquidationFlashloanContract(name, a, b, c, d)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

deployLiquidationFlashloan("LiquidationFlashloan", 
                            aavePoolAddressesProviderAdress, 
                            loanAddress, 
                            pangolinRouterAddress, 
                            PANGOLIN_EXCHANGETUP.address);

//npx hardhat run tools/scripts/deploy-liquidation-flashloan.js --network localhost