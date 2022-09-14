// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: f97d683e94fbb14f55819d6782c1f6a20998b10e;
pragma solidity ^0.8.4;

import "redstone-evm-connector/lib/contracts/commons/ProxyConnector.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "./SmartLoanDiamondBeacon.sol";
import "./proxies/SmartLoanDiamondProxy.sol";
import "./facets/AssetsOperationsFacet.sol";
import "./facets/OwnershipFacet.sol";
import "./facets/SmartLoanViewFacet.sol";

/**
 * @title SmartLoansFactory
 * @dev Contract responsible for creating new instances of SmartLoans (SmartLoanDiamondBeacon).
 * It's possible to either simply create a new loan or create and fund it with an ERC20 asset as well as borrow in a single transaction.
 * At the time of creating a loan, SmartLoansFactory contract is the owner for the sake of being able to perform the fund() and borrow() operations.
 * At the end of the createAndFundLoan the ownership is transferred to the msg.sender.
 * It's also responsible for keeping track of the loans, ensuring one loan per wallet rule, ownership transfers proposals/execution and
 * authorizes registered loans to borrow from lending pools.
 */
contract SmartLoansFactory is OwnableUpgradeable, IBorrowersRegistry {
    using TransferHelper for address;

    modifier hasNoLoan() {
        require(!_hasLoan(msg.sender), "Only one loan per owner is allowed");
        _;
    }


    SmartLoanDiamondBeacon public smartLoanDiamond;

    mapping(address => address) public ownersToLoans;
    mapping(address => address) public loansToOwners;
    mapping(address => address) public ownershipTransferProposal;

    address[] loans;

    function _hasLoan(address user) internal view returns (bool) {
        return ownersToLoans[user] != address(0);
    }

    function _proposeOwnershipTransfer(address _oldOwner, address _newOwner) internal {
        require(_hasLoan(_oldOwner), "Previous owner does not have a loan");
        require(!_hasLoan(_newOwner), "New owner already has a loan");
        ownershipTransferProposal[_oldOwner] = _newOwner;
    }

    function proposeOwnershipTransfer(address _newOwner) public {
        require(_hasLoan(msg.sender), "Msg.sender does not own a loan");
        _proposeOwnershipTransfer(msg.sender, _newOwner);
    }

    function executeOwnershipTransfer(address _oldOwner, address _newOwner) public {
        require(ownershipTransferProposal[_oldOwner] == _newOwner, "Ownership transfer proposal not found.");
        require(!_hasLoan(_newOwner), "New owner already has a loan");

        ownershipTransferProposal[_oldOwner] = address(0);

        address loan = ownersToLoans[_oldOwner];
        ownersToLoans[_newOwner] = loan;
        ownersToLoans[_oldOwner] = address(0);
        loansToOwners[loan] = _newOwner;
    }

    function initialize(address payable _smartLoanDiamond) external initializer {
        smartLoanDiamond = SmartLoanDiamondBeacon(_smartLoanDiamond);
        __Ownable_init();
    }

    function createLoan() public virtual hasNoLoan returns (SmartLoanDiamondBeacon) {
        SmartLoanDiamondProxy beaconProxy = new SmartLoanDiamondProxy(
            payable(address(smartLoanDiamond)),
        // Setting SLFactory as the initial owner and then using .transferOwnership to change the owner to msg.sender
        // It is possible to set msg.sender as the initial owner if our loan-creation flow would change
            abi.encodeWithSelector(SmartLoanViewFacet.initialize.selector, msg.sender)
        );
        SmartLoanDiamondBeacon smartLoan = SmartLoanDiamondBeacon(payable(address(beaconProxy)));

        //Update registry and emit event
        updateRegistry(address(smartLoan), msg.sender);

        emit SmartLoanCreated(address(smartLoan), msg.sender, "", 0, "", 0);
        return smartLoan;
    }

    //TODO: check how much calling an external contract for asset address would cost
    function createAndFundLoan(bytes32 _fundedAsset, address _assetAddress, uint256 _amount, bytes32 _debtAsset, uint256 _initialDebt) public virtual hasNoLoan returns (SmartLoanDiamondBeacon) {
        SmartLoanDiamondProxy beaconProxy = new SmartLoanDiamondProxy(payable(address(smartLoanDiamond)),
        // Setting SLFactory as the initial owner and then using .transferOwnership to change the owner to msg.sender
        // It is possible to set msg.sender as the initial owner if our loan-creation flow would change
            abi.encodeWithSelector(SmartLoanViewFacet.initialize.selector, address(this))
        );
        SmartLoanDiamondBeacon smartLoan = SmartLoanDiamondBeacon(payable(address(beaconProxy)));

        //Update registry and emit event
        updateRegistry(address(smartLoan), address(this));

        //Fund account with own funds and credit
        IERC20Metadata token = IERC20Metadata(_assetAddress);
        address(token).safeTransferFrom(msg.sender, address(this), _amount);
        token.approve(address(smartLoan), _amount);

        ProxyConnector.proxyCalldata(address(smartLoan), abi.encodeWithSelector(AssetsOperationsFacet.fund.selector, _fundedAsset, _amount), false);

        ProxyConnector.proxyCalldata(address(smartLoan), abi.encodeWithSelector(AssetsOperationsFacet.borrow.selector, _debtAsset, _initialDebt), false);

        _proposeOwnershipTransfer(address(this), msg.sender);
        OwnershipFacet(address(smartLoan)).transferOwnership(msg.sender);

        emit SmartLoanCreated(address(smartLoan), msg.sender, _fundedAsset, _amount, _debtAsset, _initialDebt);

        return smartLoan;
    }

    function updateRegistry(address loan, address owner) internal {
        ownersToLoans[owner] = loan;
        loansToOwners[loan] = owner;
        loans.push(loan);
    }

    function canBorrow(address _account) external view override returns (bool) {
        return loansToOwners[_account] != address(0);
    }

    function getLoanForOwner(address _user) external view override returns (address) {
        return ownersToLoans[_user];
    }

    function getOwnerOfLoan(address _loan) external view override returns (address) {
        return loansToOwners[_loan];
    }

    function getAllLoans() public view returns (address[] memory) {
        return loans;
    }

    /**
     * @dev emitted after creating a loan by the owner
     * @param accountAddress address of a new SmartLoanDiamondBeacon
     * @param creator account creating a SmartLoanDiamondBeacon
     * @param collateralAsset asset used as initial collateral
     * @param collateralAmount amount of asset used as initial collateral
     * @param debtAsset asset initially borrowed
     * @param initialDebt initial debt of a SmartLoanDiamondBeacon
     **/
    event SmartLoanCreated(address indexed accountAddress, address indexed creator, bytes32 collateralAsset, uint256 collateralAmount, bytes32 debtAsset, uint256 initialDebt);
}