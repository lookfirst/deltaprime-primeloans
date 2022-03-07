const contractName = "PangolinExchange";
const contractAddress = "0xBc45b6F1ff0626CAb1746c2a5f8173a9417A4925";
const contractMethod = "updateAssets";
const jsonRPC = "https://api.avax-test.network/ext/bc/C/rpc";

const ARTIFACT = require(`../../artifacts/contracts/${contractName}.sol/${contractName}.json`);
const ethers = require("ethers");
const fs = require("fs");
const addresses = require("../../common/token_addresses.json");
const toBytes32 = require("ethers").utils.formatBytes32String;

const key = fs.readFileSync("./.secret-deployer").toString().trim();
let mnemonicWallet = new ethers.Wallet(key);
let provider = new ethers.providers.JsonRpcProvider(jsonRPC);
let wallet = mnemonicWallet.connect(provider);



let contract = new ethers.Contract(contractAddress, ARTIFACT.abi, wallet);
const supportedAssets = [
    asset('USDT'),
    asset('BTC')
]

function asset(symbol) {
    return { asset: toBytes32(symbol), assetAddress: addresses[symbol] }
}



contract[contractMethod](
    supportedAssets
).then(
    res => {
        console.log(res);
    }
)

