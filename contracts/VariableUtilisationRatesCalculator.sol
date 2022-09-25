// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: 48991ca286a107aedf142ae9fd21b421b08f5025;
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRatesCalculator.sol";

/**
 * @title VariableUtilisationRatesCalculator
 * @dev Contract which calculates the interest rates based on pool utilisation.
 * Utilisation is computed as the ratio between funds borrowed and funds deposited to the pool.
 * Borrowing rates are calculated using a piecewise linear function. The first piece is defined by SLOPE_1
 * and OFFSET (shift). Second piece is defined by SLOPE_2 (calculated off-chain), BREAKPOINT (threshold value above
 * which second piece is considered) and MAX_RATE (value at pool utilisation of 1).
 **/
contract VariableUtilisationRatesCalculator is IRatesCalculator, Ownable {
    uint256 public constant SLOPE_1 = 0;
    uint256 public constant OFFSET_1 = 0.03e18;

    uint256 public constant BREAKPOINT_1 = 0.6e18;

    uint256 public constant SLOPE_2 = 0.45e18;
    //negative, hence minus in calculations
    uint256 public constant OFFSET_2 = 0.24e18;

    uint256 public constant BREAKPOINT_2 = 0.8e18;

    uint256 public constant SLOPE_3 = 3.15e18;
    //negative, hence minus in calculations
    uint256 public constant OFFSET_3 = 2.4e18;

    // BREAKPOINT must be lower than 1e18
    uint256 public constant MAX_RATE = 0.75e18;

    //residual spread to account for arithmetic inaccuracies in calculation of deposit rate. Does not result in any meaningful
    //profit generation
    uint256 public spread = 1e12;

    /* ========== VIEW FUNCTIONS ========== */

    /**
     * Returns the pool utilisation, which is a ratio between loans and deposits
     * utilisation = value_of_loans / value_of_deposits
     * @dev _totalLoans total value of loans
     * @dev _totalDeposits total value of deposits
     **/
    function getPoolUtilisation(uint256 _totalLoans, uint256 _totalDeposits) public pure returns (uint256) {
        if (_totalDeposits == 0) return 0;

        return (_totalLoans * 1e18) / _totalDeposits;
    }

    /**
     * Returns the current deposit rate
     * The value is based on the current borrowing rate and satisfies the invariant:
     * value_of_loans * borrowing_rate = value_of_deposits * deposit_rate
     * @dev _totalLoans total value of loans
     * @dev _totalDeposits total value of deposits
     **/
    function calculateDepositRate(uint256 _totalLoans, uint256 _totalDeposits) external view override returns (uint256) {
        if (_totalDeposits == 0) return 0;

        if (_totalLoans >= _totalDeposits) {
            return MAX_RATE * (1e18 - spread) / 1e18;
        } else {
            uint256 rate = this.calculateBorrowingRate(_totalLoans, _totalDeposits) * (1e18 - spread) * _totalLoans / (_totalDeposits * 1e18);
            return rate;
        }
    }

    /**
     * Returns the current borrowing rate
     * The value is based on the pool utilisation according to the piecewise linear formula:
     * 1) for pool utilisation lower than or equal to breakpoint:
     * borrowing_rate = SLOPE_1 * utilisation + OFFSET
     * 2) for pool utilisation greater than breakpoint:
     * borrowing_rate = SLOPE_2 * utilisation + MAX_RATE - SLOPE_2
     * @dev _totalLoans total value of loans
     * @dev _totalDeposits total value of deposits
     **/
    function calculateBorrowingRate(uint256 totalLoans, uint256 totalDeposits) external view override returns (uint256) {
        if (totalDeposits == 0) return OFFSET_1;

        uint256 poolUtilisation = getPoolUtilisation(totalLoans, totalDeposits);

        if (poolUtilisation >= 1e18) {
            return MAX_RATE;
        } else if (poolUtilisation <= BREAKPOINT_1) {
            return (poolUtilisation * SLOPE_1) / 1e18 + OFFSET_1;
        } else if (poolUtilisation <= BREAKPOINT_2) {
            return (poolUtilisation * SLOPE_2) / 1e18 - OFFSET_2;
        } else {
            // full formula derived from piecewise linear function calculation except for SLOPE_2 subtraction (separated for
            // unsigned integer safety check)
            return (poolUtilisation * SLOPE_3) / 1e18 - OFFSET_3;
        }
    }

    /* ========== SETTERS ========== */
    /**
     * Sets the spread between deposit and borrow rate, number between 0 and 1e18
     * @param _spread spread defined by user
     **/
    function setSpread(uint256 _spread) external onlyOwner {
        require(_spread < 1e18, "Spread must be smaller than 1e18");
        spread = _spread;
    }
}