// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: ;
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../../ReentrancyGuardKeccak.sol";
import "../../interfaces/IVectorFinanceStaking.sol";
import {DiamondStorageLib} from "../../lib/DiamondStorageLib.sol";
import "../../interfaces/IStakingPositions.sol";
import "../../OnlyOwnerOrInsolvent.sol";
//This path is updated during deployment
import "../../lib/local/DeploymentConstants.sol";

contract VectorFinanceFacet is ReentrancyGuardKeccak, OnlyOwnerOrInsolvent {

    // CONSTANTS

    address private constant VectorMainStaking = 0x8B3d9F0017FA369cD8C164D0Cc078bf4cA588aE5;

    address private constant USDCAddress = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E;
    address private constant VectorUSDCStaking1 = 0x7a4a145bb3126fd29fe820c7cafd6a6Ff428621A;

    address private constant WAVAXAddress = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;
    address private constant VectorWAVAXStaking1 = 0x4E42d1a0b83fA354882f19E89a316E00bc106a98;

    address private constant SAVAXAddress = 0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE;
    address private constant VectorSAVAXStaking1 = 0x822C11be60258D6Bf00C5B0907B2015633d11a62;

    // PUBLIC FUNCTIONS

    function vectorStakeUSDC1(uint256 amount) public {
        IStakingPositions.StakedPosition memory position = IStakingPositions.StakedPosition({
            vault: VectorUSDCStaking1,
            symbol: "USDC",
            balanceSelector: this.vectorUSDC1Balance.selector,
            unstakeSelector: this.vectorUnstakeUSDC1.selector
        });
        stakeToken("USDC", USDCAddress, VectorUSDCStaking1, amount, position);
    }

    function vectorUnstakeUSDC1(uint256 amount, uint256 minAmount) public {
        unstakeToken("USDC", USDCAddress, VectorUSDCStaking1, amount, minAmount, this.vectorUSDC1Balance.selector);
    }

    function vectorUSDC1Balance() public view returns(uint256 _stakedBalance) {
        IVectorFinanceStaking stakingContract = IVectorFinanceStaking(VectorUSDCStaking1);
        _stakedBalance = stakingContract.balance(address(this));
    }

    function vectorStakeWAVAX1(uint256 amount) public {
        IStakingPositions.StakedPosition memory position = IStakingPositions.StakedPosition({
            vault: VectorWAVAXStaking1,
            symbol: "AVAX",
            balanceSelector: this.vectorWAVAX1Balance.selector,
            unstakeSelector: this.vectorUnstakeWAVAX1.selector
        });
        stakeToken("AVAX", WAVAXAddress, VectorWAVAXStaking1, amount, position);
    }

    function vectorUnstakeWAVAX1(uint256 amount, uint256 minAmount) public {
        unstakeToken("AVAX", WAVAXAddress, VectorWAVAXStaking1, amount, minAmount, this.vectorWAVAX1Balance.selector);
    }

    function vectorWAVAX1Balance() public view returns(uint256 _stakedBalance) {
        IVectorFinanceStaking stakingContract = IVectorFinanceStaking(VectorWAVAXStaking1);
        _stakedBalance = stakingContract.balance(address(this));
    }

    function vectorStakeSAVAX1(uint256 amount) public {
        IStakingPositions.StakedPosition memory position = IStakingPositions.StakedPosition({
            vault: VectorSAVAXStaking1,
            symbol: "sAVAX",
            balanceSelector: this.vectorSAVAX1Balance.selector,
            unstakeSelector: this.vectorUnstakeSAVAX1.selector
        });
        stakeToken("sAVAX", SAVAXAddress, VectorSAVAXStaking1, amount, position);
    }

    function vectorUnstakeSAVAX1(uint256 amount, uint256 minAmount) public {
        unstakeToken("sAVAX", SAVAXAddress, VectorSAVAXStaking1, amount, minAmount, this.vectorSAVAX1Balance.selector);
    }

    function vectorSAVAX1Balance() public view returns(uint256 _stakedBalance) {
        IVectorFinanceStaking stakingContract = IVectorFinanceStaking(VectorSAVAXStaking1);
        _stakedBalance = stakingContract.balance(address(this));
    }

    // INTERNAL FUNCTIONS
    /**
    * @dev This function uses the redstone-evm-connector
    **/
    function stakeToken(bytes32 stakedTokenSymbol, address stakedToken, address receiptToken, uint256 amount, IStakingPositions.StakedPosition memory position) internal
    onlyOwner nonReentrant remainsSolvent {
        require(amount > 0, "Cannot stake 0 tokens");
        require(IERC20Metadata(stakedToken).balanceOf(address(this)) >= amount, "Not enough token available");

        IERC20Metadata(stakedToken).approve(VectorMainStaking, amount);

        IVectorFinanceStaking(receiptToken).deposit(amount);

        DiamondStorageLib.addStakedPosition(position);

        IERC20Metadata token = getERC20TokenInstance(stakedTokenSymbol, false);

        if (token.balanceOf(address(this)) == 0) {
            DiamondStorageLib.removeOwnedAsset(stakedTokenSymbol);
        }

        emit Staked(msg.sender, stakedTokenSymbol, receiptToken, amount, block.timestamp);
    }

    /**
    * Unstakes token from Vector Finance
    * IMPORTANT: This method can be used by anyone when a loan is insolvent. This operation can be costly, that is why
    * if needed it has to be performed in a separate transaction to liquidation
    * @dev This function uses the redstone-evm-connector
    **/
    function unstakeToken(bytes32 stakedTokenSymbol, address stakedToken, address receiptToken, uint256 amount, uint256 minAmount, bytes4 balanceSelector) internal
    onlyOwnerOrInsolvent nonReentrant returns (uint256 unstaked) {
        require(amount > 0, "Cannot unstake 0 tokens");

        IVectorFinanceStaking stakingContract = IVectorFinanceStaking(receiptToken);
        uint256 initialStakedBalance = stakingContract.balance(address(this));

        require(initialStakedBalance >= amount, "Cannot unstake more than was initially staked");

        IERC20Metadata token = getERC20TokenInstance(stakedTokenSymbol, true);

        uint256 balance = token.balanceOf(address(this));

        stakingContract.withdraw(amount, minAmount);

        uint256 newBalance = token.balanceOf(address(this));

        if (stakingContract.balance(address(this)) == 0) {
            DiamondStorageLib.removeStakedPosition(balanceSelector);
        }
        DiamondStorageLib.addOwnedAsset(stakedTokenSymbol, stakedToken);

        emit Unstaked(msg.sender, stakedTokenSymbol, receiptToken, newBalance - balance, block.timestamp);

        _handleRewards(stakingContract);

        return newBalance - balance;
    }

    function _handleRewards(IVectorFinanceStaking stakingContract) internal {
        IVectorRewarder rewarder = stakingContract.rewarder();
        TokenManager tokenManager = DeploymentConstants.getTokenManager();
        uint256 index;

        // We do not want to revert in case of unsupported rewardTokens in order not to block the unstaking/liquidation process
        while(true) {
            // No access to the length of rewardTokens[]. Need to iterate until indexOutOfRange
            (bool success, bytes memory result) = address(rewarder).call(abi.encodeWithSignature("rewardTokens(uint256)", index));
            if(!success) {
                break;
            }
            address rewardToken = abi.decode(result, (address));
            bytes32 rewardTokenSymbol = tokenManager.tokenAddressToSymbol(rewardToken);
            if(rewardTokenSymbol == "") {
                emit UnsupportedRewardToken(msg.sender, rewardToken, block.timestamp);
                index += 1;
                continue;
            }
            if(IERC20(rewardToken).balanceOf(address(this)) > 0) {
                DiamondStorageLib.addOwnedAsset(rewardTokenSymbol, rewardToken);
            }
            index += 1;
        }
    }

    // MODIFIERS

    modifier onlyOwner() {
        DiamondStorageLib.enforceIsContractOwner();
        _;
    }

    // EVENTS

    /**
        * @dev emitted when user stakes an asset
        * @param user the address executing staking
        * @param asset the asset that was staked
        * @param vault address of receipt token
        * @param amount of the asset that was staked
        * @param timestamp of staking
    **/
    event Staked(address indexed user, bytes32 indexed asset, address indexed vault, uint256 amount, uint256 timestamp);

    /**
        * @dev emitted when user unstakes an asset
        * @param user the address executing unstaking
        * @param asset the asset that was unstaked
        * @param vault address of receipt token
        * @param amount of the asset that was unstaked
        * @param timestamp of unstaking
    **/
    event Unstaked(address indexed user, bytes32 indexed asset, address indexed vault, uint256 amount, uint256 timestamp);

    /**
        * @dev emitted when user collects rewards in tokens that are not supported
        * @param user the address collecting rewards
        * @param asset reward token that was collected
        * @param timestamp of collecting rewards
    **/
    event UnsupportedRewardToken(address indexed user, address indexed asset, uint256 timestamp);
}