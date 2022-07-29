pragma solidity ^0.8.4;

import "../faucets/SmartLoanLiquidationFacet.sol";

contract MockSmartLoanLiquidationFacetRedstoneProvider is SmartLoanLiquidationFacet {
    /**
     * Override PriceAware method, addresses below belong to authorized signers of data feeds
     **/
    function isSignerAuthorized(address _receivedSigner) public override virtual view returns (bool) {
        return
        _receivedSigner == SmartLoanLib.getPriceProvider1() ||
        _receivedSigner == SmartLoanLib.getPriceProvider2() ||
        _receivedSigner == SmartLoanLib.getPriceProvider3() ||
        _receivedSigner == SmartLoanLib.getPriceProvider4() ||
        _receivedSigner == SmartLoanLib.getPriceProvider5() ||
        _receivedSigner == SmartLoanLib.getPriceProvider6() ||
        _receivedSigner == SmartLoanLib.getPriceProvider7() ||
        _receivedSigner == SmartLoanLib.getPriceProvider8() ||
        _receivedSigner == SmartLoanLib.getPriceProvider9() ||
        _receivedSigner == SmartLoanLib.getPriceProvider10() ||
        _receivedSigner == SmartLoanLib.getPriceProvider11() ||
        _receivedSigner == SmartLoanLib.getPriceProvider12() ||
        _receivedSigner == SmartLoanLib.getPriceProvider13() ||
        _receivedSigner == SmartLoanLib.getPriceProvider14() ||
        _receivedSigner == SmartLoanLib.getPriceProvider15() ||
        _receivedSigner == SmartLoanLib.getPriceProvider16() ||
        _receivedSigner == SmartLoanLib.getPriceProvider17() ||
        _receivedSigner == SmartLoanLib.getPriceProvider18() ||
        _receivedSigner == SmartLoanLib.getPriceProvider19() ||
        _receivedSigner == SmartLoanLib.getPriceProvider20() ||
        _receivedSigner == SmartLoanLib.getPriceProvider21() ||
        _receivedSigner == SmartLoanLib.getPriceProvider22() ||
        _receivedSigner == SmartLoanLib.getPriceProvider23()
        ;
    }
}