// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (proxy/beacon/IBeacon.sol)

pragma solidity ^0.8.0;

/**
 * @dev This is the interface that {BeaconProxy} expects of its beacon.
 */
interface IDiamondBeacon {

    function implementation() external view returns (address);

    /**
     * @dev Must return an address that can be used as a delegate call target.
     *
     * {DiamondBeaconProxy} will check that this address is a contract.
     */
    function implementation(bytes4) external view returns (address);
}
