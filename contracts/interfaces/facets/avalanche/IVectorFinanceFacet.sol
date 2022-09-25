interface IVectorFinanceFacet {
    function vectorStakeUSDC1(uint256 amount) external;

    function vectorStakeUSDC2(uint256 amount) external;

    function vectorStakeWAVAX1(uint256 amount) external;

    function vectorStakeSAVAX1(uint256 amount) external;

    function vectorUnstakeUSDC1(uint256 amount, uint256 minAmount) external;

    function vectorUnstakeUSDC2(uint256 amount, uint256 minAmount) external;

    function vectorUnstakeWAVAX1(uint256 amount, uint256 minAmount) external;

    function vectorUnstakeSAVAX1(uint256 amount, uint256 minAmount) external;

    function vectorUSDC1Balance() external view returns(uint256);

    function vectorUSDC2Balance() external view returns(uint256);

    function vectorWAVAX1Balance() external view returns(uint256);

    function vectorSAVAX1Balance() external view returns(uint256);
}
