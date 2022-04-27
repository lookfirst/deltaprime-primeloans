// SPDX-License-Identifier: UNLICENSED
// Last deployed from commit: 0fbd3d2132ce3d3a12c966ee5e6ffba53aae9d33;
pragma solidity ^0.8.4;
import "../abstract/NFTAccess.sol";
import "../SmartLoansFactory.sol";

contract SmartLoansFactoryWithAccessNFT is NFTAccess, SmartLoansFactory {
    function createLoan() public override oneLoanPerOwner hasAccessNFT returns (SmartLoan) {
        BeaconProxy beaconProxy = new BeaconProxy(
            payable(address(upgradeableBeacon)),
            abi.encodeWithSelector(SmartLoan.initialize.selector, 0)
        );
        SmartLoan smartLoan = SmartLoan(payable(address(beaconProxy)));

        //Update registry and emit event
        updateRegistry(smartLoan);
        smartLoan.transferOwnership(msg.sender);

        emit SmartLoanCreated(address(smartLoan), msg.sender, "", 0, 0);

        return smartLoan;
    }

    function createAndFundLoan(bytes32 fundedAsset, uint256 _amount, uint256 _initialDebt) public override oneLoanPerOwner hasAccessNFT returns (SmartLoan) {
        BeaconProxy beaconProxy = new BeaconProxy(payable(address(upgradeableBeacon)),
            abi.encodeWithSelector(SmartLoan.initialize.selector));
        SmartLoan smartLoan = SmartLoan(payable(address(beaconProxy)));

        //Update registry and emit event
        updateRegistry(smartLoan);

        //Fund account with own funds and credit
        smartLoan.fund(fundedAsset, _amount);

        ProxyConnector.proxyCalldata(address(smartLoan), abi.encodeWithSelector(SmartLoan.borrow.selector, _initialDebt));

        smartLoan.transferOwnership(msg.sender);

        emit SmartLoanCreated(address(smartLoan), msg.sender, fundedAsset, _amount, _initialDebt);

        return smartLoan;
    }
}
