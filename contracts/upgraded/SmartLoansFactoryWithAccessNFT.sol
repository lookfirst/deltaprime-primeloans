// SPDX-License-Identifier: UNLICENSED
// Last deployed from commit: 0fbd3d2132ce3d3a12c966ee5e6ffba53aae9d33;
pragma solidity ^0.8.4;
import "../abstract/NFTAccess.sol";
import "../SmartLoansFactory.sol";


// TODO: Cannot it simply be super.createLoan() wit NFTAccess etc?
contract SmartLoansFactoryWithAccessNFT is NFTAccess, SmartLoansFactory {
    function createLoan() public override oneLoanPerOwner hasAccessNFT returns (SmartLoan) {
        DiamondBeaconProxy beaconProxy = new DiamondBeaconProxy(
            payable(address(smartLoanRouter)),
            abi.encodeWithSelector(DiamondInit.init.selector, 0)
        );
        SmartLoan smartLoan = SmartLoan(payable(address(beaconProxy)));

        //Update registry and emit event
        updateRegistry(smartLoan);
        OwnershipFacet(address(smartLoan)).transferOwnership(msg.sender);

        emit SmartLoanCreated(address(smartLoan), msg.sender, "", 0, 0);

        return smartLoan;
    }

    function createAndFundLoan(bytes32 fundedAsset, uint256 _amount, uint256 _initialDebt) public override oneLoanPerOwner hasAccessNFT returns (SmartLoan) {
        DiamondBeaconProxy beaconProxy = new DiamondBeaconProxy(payable(address(smartLoanRouter)),
            abi.encodeWithSelector(DiamondInit.init.selector));
        SmartLoan smartLoan = SmartLoan(payable(address(beaconProxy)));

        //Update registry and emit event
        updateRegistry(smartLoan);

        //Fund account with own funds and credit
        SmartLoanLogicFacet(payable(address(smartLoan))).fund(fundedAsset, _amount);

        ProxyConnector.proxyCalldata(address(smartLoan), abi.encodeWithSelector(SmartLoanLogicFacet.borrow.selector, _initialDebt));

        OwnershipFacet(address(smartLoan)).transferOwnership(msg.sender);

        emit SmartLoanCreated(address(smartLoan), msg.sender, fundedAsset, _amount, _initialDebt);

        return smartLoan;
    }
}
