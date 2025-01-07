pragma solidity ^0.8.0;


/**
 * @dev A mock price feed that provides latestRoundData with the Chainlink
 *      price feed interface. A setPrice function (which does not enforce
 *      access control) is used to set the price after the initial value
 *      specified during deployment.
 */
contract PriceFeed {
    int256 price;
    uint256 updatedAt;

    constructor(int256 _price) {
        price = _price;
        updatedAt = block.timestamp;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (0, price, 0, updatedAt, 0);
    }

    function setPrice(int256 _price) external {
        price = _price;
    }

    function setUpdatedAtTimestamp(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }
}
