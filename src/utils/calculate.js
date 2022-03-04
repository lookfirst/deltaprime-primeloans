import config from "@/config";
const ethers = require('ethers');

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

export function parseLogs(loan, logs) {
  let collateralFromPayments = 0;
  let loanEvents = [];

  logs.forEach(log => {
    let parsed = loan.iface.parseLog(log);

    let event = {
      type: parsed.name,
      time: new Date(parseInt(parsed.args.timestamp.toString()) * 1000),
      tx: log.transactionHash
    };

    let value;

    value = event.type === 'Liquidated' ? parsed.args.repayAmount : parsed.args.amount;

    if (event.type === 'Invested' || event.type === 'Redeemed') {
      event.asset = ethers.utils.parseBytes32String(parsed.args.asset);
      event.value = parseFloat(ethers.utils.formatUnits(value, config.ASSETS_CONFIG[event.asset].decimals));
    } else {
      event.value = parseFloat(ethers.utils.formatEther(value));
    }



    if (event.type === 'Funded') collateralFromPayments += event.value;
    if (event.type === 'Withdrawn') collateralFromPayments -= event.value;

    loanEvents.unshift(event);
  });

  return [loanEvents, collateralFromPayments]
}

export function roundWithPrecision(num, precision) {
  var multiplier = Math.pow(10, precision);
  return Math.round( num * multiplier ) / multiplier;
}

export function round(num) {
  return roundWithPrecision(num, 18);
}

export const fromWei = val => parseFloat(ethers.utils.formatEther(val));
export const toWei = ethers.utils.parseEther;
export const parseUnits = ethers.utils.parseUnits;
export const formatUnits = ethers.utils.formatUnits;
