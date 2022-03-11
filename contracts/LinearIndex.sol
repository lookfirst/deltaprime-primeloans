// SPDX-License-Identifier: UNLICENSED
// Last deployed from commit: c5c938a0524b45376dd482cd5c8fb83fa94c2fcc;
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * LinearIndex
 * The contract contains logic for time-based index recalculation with minimal memory footprint.
 * It could be used as a base building block for any index-based entities like deposits and loans.
 * The index is updated on a linear basis to the compounding happens when a user decide to accumulate the interests
 * @dev updatedRate the value of updated rate
 **/
contract LinearIndex is OwnableUpgradeable {

    uint256 private constant SECONDS_IN_YEAR = 365 days;
    uint256 private constant BASE_RATE = 1e18;

    uint256 public start = block.timestamp;

    uint256 public index = BASE_RATE;
    uint256 public indexUpdateTime = start;

    mapping(uint256 => uint256) prevIndex;
    mapping(address => uint256) userUpdateTime;

    uint256 public rate;

    function initialize(address owner_) external initializer {
        start = block.timestamp;
        index = BASE_RATE;
        indexUpdateTime = start;

        __Ownable_init();
        transferOwnership(owner_);
    }

    /* ========== SETTERS ========== */

    /**
     * Sets the new rate
     * Before the new rate is set, the index is updated accumulating interest
     * @dev updatedRate the value of updated rate
   **/
    function setRate(uint256 _rate) public onlyOwner {
        updateIndex();
        rate = _rate;
        emit RateUpdated(rate);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * Updates user index
     * It persists the update time and the update index time->index mapping
     * @dev user address of the index owner
   **/
    function updateUser(address user) public onlyOwner {
        userUpdateTime[user] = block.timestamp;
        prevIndex[block.timestamp] = getIndex();
    }

    /* ========== VIEW FUNCTIONS ========== */

    /**
     * Gets current value of the linear index
     * It recalculates the value on-demand without updating the storage
     **/
    function getIndex() public view returns (uint256) {
        uint256 period = block.timestamp - indexUpdateTime;
        if (period > 0) {
            return index * getLinearFactor(period) / 1e27;
        } else {
            return index;
        }
    }

    /**
     * Gets the user value recalculated to the current index
     * It recalculates the value on-demand without updating the storage
     * Ray operations round up the result, but it is only an issue for very small values (with an order of magnitude
     * of 1 Wei)
     **/
    function getIndexedValue(uint256 value, address user) public view returns (uint256) {
        uint256 userTime = userUpdateTime[user];
        uint256 prevUserIndex = userTime == 0 ? BASE_RATE : prevIndex[userTime];

        return value * getIndex() / prevUserIndex;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function updateIndex() internal {
        prevIndex[indexUpdateTime] = index;

        index = getIndex();
        indexUpdateTime = block.timestamp;
    }

    /**
     * Returns a linear factor in Ray
     **/
    function getLinearFactor(uint256 period) virtual internal view returns (uint256) {
        return rate * period * 1e9 / SECONDS_IN_YEAR + 1e27;
    }

    /* ========== EVENTS ========== */

    /**
     * @dev updatedRate the value of updated rate
   **/
    event RateUpdated(uint256 updatedRate);
}