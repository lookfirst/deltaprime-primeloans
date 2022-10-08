import config from "@/config";
const ethers = require('ethers');
//TODO: store in one place
const erc20ABI = [
  'function decimals() public view returns (uint8)',
  'function balanceOf(address _owner) public view returns (uint256 balance)',
  'function totalSupply() public view returns (uint256 supply)',
  'function totalDeposits() public view returns (uint256 deposits)',
  'function approve(address _spender, uint256 _value) public returns (bool success)',
  'function allowance(address owner, address spender) public view returns (uint256)'
];

export function calculateCollateral(amount) {
    if (amount) {
        return config.DEFAULT_LTV * amount - amount;
    }
}

export function acceptableSlippage(currentSlippage) {
  if (!currentSlippage) {
    currentSlippage = 0;
  }
  return currentSlippage + config.SLIPPAGE_TOLERANCE;
}

export function maxAvaxToBeSold(amount, currentSlippage) {
  return (1 + (currentSlippage ? currentSlippage : 0)) * amount;
}

export function minAvaxToBeBought(amount, currentSlippage) {
  return amount / (1 + (currentSlippage ? currentSlippage : 0));
}

export function parseLogs(logs) {
  let loanEvents = [];

  logs.forEach(log => {
    let event = {
      type: log.name,
      time: new Date(parseInt(log.timestamp.toString()) * 1000),
      tx: log.id
    };

    if (event.type === 'Bought' || event.type === 'Sold') {
      event.asset = ethers.utils.parseBytes32String(log.toAsset);
      event.value = parseFloat(ethers.utils.formatUnits(log.amount, config.ASSETS_CONFIG[event.asset].decimals));
    } else {
      event.value = parseFloat(ethers.utils.formatEther(log.amount));
    }

    loanEvents.unshift(event);
  });

  return loanEvents;
}

export function roundWithPrecision(num, precision) {
  var multiplier = Math.pow(10, precision);
  return Math.round( num * multiplier ) / multiplier;
}

export function round(num) {
  return roundWithPrecision(num, 18);
}

export function aprToApy(apr) {
  const compoundingPeriods = 100000;
  return Math.pow(1 + (apr / compoundingPeriods), compoundingPeriods) - 1;
}

export async function yyApy(avaxFarmAddress) {
  const apysUrl = 'https://staging-api.yieldyak.com/apys';
  return (await (await fetch(apysUrl)).json())[avaxFarmAddress].apy / 100;
}

export async function yyStaked(stakingContractAddress, smartLoanContractAddress) {
  const tokenContract = new ethers.Contract(stakingContractAddress, erc20ABI, provider.getSigner());
  const totalSupply = Number(await tokenContract.totalSupply());
  const totalDeposits = Number(await tokenContract.totalDeposits());
  const yrtToAvaxConversionRate = totalDeposits / totalSupply;
  const stakedYrtWei = await tokenContract.balanceOf(smartLoanContractAddress);
  const stakedYrt = Number(fromWei(stakedYrtWei));
  console.log('yyStaked')
  console.log(stakedYrt * yrtToAvaxConversionRate)
  return stakedYrt * yrtToAvaxConversionRate;
}

export const fromWei = val => parseFloat(ethers.utils.formatEther(val));
export const toWei = ethers.utils.parseEther;
export const parseUnits = ethers.utils.parseUnits;
export const formatUnits = ethers.utils.formatUnits;
