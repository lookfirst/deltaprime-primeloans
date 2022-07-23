import verifyContract from "../tools/scripts/verify-contract";
import hre from 'hardhat'

const {embedCommitHash} = require("../tools/scripts/embed-commit-hash");
const pangolinRouterAddress = '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106';
const aavePoolAddressesProviderAdress = '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb';

module.exports = async ({
    getNamedAccounts,
    deployments
    }) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();
    
    embedCommitHash('LiquidationFlashloan');

    let result = await deploy('LiquidationFlashloan', {
        from: deployer,
        gasLimit: 8_000_000,
        args: [     
            aavePoolAddressesProviderAdress,
            liquidateFacet.address,
            pangolinRouterAddress,
            PANGOLIN_EXCHANGETUP.address   
        ]
    });
    
    await verifyContract(hre, {
        address: result.address
    });
    
    
    console.log(`Deployed LiquidationFlashloan at address: ${result.address}`);
};
    
module.exports.tags = ['init'];