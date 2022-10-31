import {ethers, waffle} from 'hardhat'
import chai, {expect} from 'chai'
import {solidity} from "ethereum-waffle";

import TokenManagerArtifact from '../../../artifacts/contracts/TokenManager.sol/TokenManager.json';
import SmartLoansFactoryArtifact from '../../../artifacts/contracts/SmartLoansFactory.sol/SmartLoansFactory.json';
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {WrapperBuilder} from "@redstone-finance/evm-connector";
import {
    addMissingTokenContracts,
    Asset,
    convertAssetsListToSupportedAssets,
    convertTokenPricesMapToMockPrices,
    deployAllFacets,
    deployPools,
    fromWei,
    getFixedGasSigners,
    getRedstonePrices,
    getTokensPricesMap,
    PoolAsset,
    PoolInitializationObject,
    recompileConstantsFile,
    toBytes32,
    toWei
} from "../../_helpers";
import {syncTime} from "../../_syncTime"
import {
    RedstoneConfigManager__factory,
    SmartLoanGigaChadInterface,
    SmartLoansFactory,
    TokenManager,
} from "../../../typechain";
import {deployDiamond} from '../../../tools/diamond/deploy-diamond';
import {Contract} from "ethers";

chai.use(solidity);

const {deployContract} = waffle;

describe('Smart loan', () => {
    before("Synchronize blockchain time", async () => {
        await syncTime();
    });


    describe('A loan with debt and repayment', () => {
        let smartLoansFactory: SmartLoansFactory,
            loan: SmartLoanGigaChadInterface,
            wrappedLoan: any,
            admin: SignerWithAddress,
            borrower: SignerWithAddress,
            depositor: SignerWithAddress,
            MOCK_PRICES: any,
            poolContracts: Map<string, Contract> = new Map(),
            tokenContracts: Map<string, Contract> = new Map(),
            lendingPools: Array<PoolAsset> = [],
            supportedAssets: Array<Asset>,
            tokensPrices: Map<string, number>;

        before("deploy factory, wrapped native token pool and USD pool", async () => {
            [admin, depositor, borrower] = await getFixedGasSigners(10000000);
            let assetsList = ['AVAX', 'ETH', 'MCKUSD'];
            let poolNameAirdropList: Array<PoolInitializationObject> = [
                {name: 'AVAX', airdropList: [depositor]},
                {name: 'MCKUSD', airdropList: [borrower, depositor]}
            ];
            let redstoneConfigManager = await (new RedstoneConfigManager__factory(admin).deploy(["0xFE71e9691B9524BC932C23d0EeD5c9CE41161884"]));

            let diamondAddress = await deployDiamond();

            smartLoansFactory = await deployContract(admin, SmartLoansFactoryArtifact) as SmartLoansFactory;
            await smartLoansFactory.initialize(diamondAddress);

            await deployPools(smartLoansFactory, poolNameAirdropList, tokenContracts, poolContracts, lendingPools, admin, depositor);
            tokensPrices = await getTokensPricesMap(assetsList.filter(el => el !== 'MCKUSD'), getRedstonePrices, [{symbol: 'MCKUSD', value: 1}]);
            MOCK_PRICES = convertTokenPricesMapToMockPrices(tokensPrices);
            supportedAssets = convertAssetsListToSupportedAssets(assetsList, {MCKUSD: tokenContracts.get('MCKUSD')!.address});
            addMissingTokenContracts(tokenContracts, assetsList);

            let tokenManager = await deployContract(
                admin,
                TokenManagerArtifact,
                [
                    supportedAssets,
                    lendingPools
                ]
            ) as TokenManager;

            await recompileConstantsFile(
                'local',
                "DeploymentConstants",
                [],
                tokenManager.address,
                redstoneConfigManager.address,
                diamondAddress,
                smartLoansFactory.address,
                'lib'
            );
            await deployAllFacets(diamondAddress)
        });


        it("should deploy a smart loan", async () => {
            await smartLoansFactory.connect(borrower).createLoan();

            const loan_proxy_address = await smartLoansFactory.getLoanForOwner(borrower.address);
            loan = await ethers.getContractAt("SmartLoanGigaChadInterface", loan_proxy_address, borrower);

            wrappedLoan =  WrapperBuilder
                // @ts-ignore
                .wrap(loan)
                .usingSimpleNumericMock({
                    mockSignersCount: 10,
                    dataPoints: MOCK_PRICES
                });
        });

        it("should fail to borrow funds without a collateral in place", async () => {
            await expect(wrappedLoan.borrow(toBytes32("MCKUSD"), 1)).to.be.revertedWith("The action may cause an account to become insolvent");
        });


        it("should fund a loan", async () => {
            expect(fromWei(await wrappedLoan.getTotalValue())).to.be.equal(0);
            expect(fromWei(await wrappedLoan.getDebt())).to.be.equal(0);
            expect(fromWei(await wrappedLoan.getHealthRatio())).to.be.equal(1.157920892373162e+59);

            await tokenContracts.get('MCKUSD')!.connect(borrower).approve(wrappedLoan.address, toWei("1000"));
            await wrappedLoan.fund(toBytes32("MCKUSD"), toWei("300"));

            expect(fromWei(await tokenContracts.get('MCKUSD')!.connect(borrower).balanceOf(wrappedLoan.address))).to.be.equal(300);
            expect(fromWei(await wrappedLoan.getTotalValue())).to.be.closeTo(300, 0.5);
            expect(fromWei(await wrappedLoan.getThresholdWeightedValue())).to.be.closeTo(250, 0.1);
            expect(fromWei(await wrappedLoan.getDebt())).to.be.equal(0);
            expect(fromWei(await wrappedLoan.getHealthRatio())).to.be.equal(1.157920892373162e+59);
        });

        it("should fail to borrow funds from the pool as a non-registered account", async () => {
            await expect(poolContracts.get('MCKUSD')!.connect(depositor).borrow(toWei("300"))).to.be.revertedWith("Only authorized accounts may borrow");
            await expect(poolContracts.get('MCKUSD')!.connect(borrower).borrow(toWei("300"))).to.be.revertedWith("Only authorized accounts may borrow");
        });

        it("should fail to borrow funds as a non-owner", async () => {
            let nonOwnerWrappedLoan = WrapperBuilder
                // @ts-ignore
                .wrap(loan.connect(depositor))
                .usingSimpleNumericMock({
                    mockSignersCount: 10,
                    dataPoints: MOCK_PRICES
                });
            await expect(nonOwnerWrappedLoan.borrow(toBytes32("MCKUSD"), toWei("300"))).to.be.revertedWith("DiamondStorageLib: Must be contract owner");
        });


        it("should borrow funds in the same token as funded", async () => {
            await wrappedLoan.borrow(toBytes32("MCKUSD"), toWei("300"));
            expect(fromWei(await tokenContracts.get('MCKUSD')!.connect(borrower).balanceOf(wrappedLoan.address))).to.be.equal(600);
            expect(fromWei(await wrappedLoan.getTotalValue())).to.be.closeTo(300 + 300, 1);
            expect(fromWei(await wrappedLoan.getDebt())).to.be.closeTo(300, 0.5);
            expect(fromWei(await wrappedLoan.getThresholdWeightedValue())).to.be.closeTo(500, 0.1);
            expect(fromWei(await wrappedLoan.getHealthRatio())).to.be.closeTo(1.66666666666, 0.001);
        });

        it("should borrow funds in a different token than funded", async () => {
            await wrappedLoan.borrow(toBytes32("AVAX"), toWei("1"));

            expect(fromWei(await tokenContracts.get('AVAX')!.connect(borrower).balanceOf(wrappedLoan.address))).to.be.equal(1);
            expect(fromWei(await wrappedLoan.getTotalValue())).to.be.closeTo(600 + tokensPrices.get('AVAX')! * 1, 1);

            let debt = 300 + tokensPrices.get('AVAX')! * 1;
            let maxDebt = 0.833333 * (600 + tokensPrices.get('AVAX')! * 1);

            expect(fromWei(await wrappedLoan.getDebt())).to.be.closeTo(debt, 0.1);
            expect(fromWei(await wrappedLoan.getThresholdWeightedValue())).to.be.closeTo(maxDebt, 0.1);

            expect(fromWei(await wrappedLoan.getHealthRatio())).to.be.closeTo(maxDebt / debt, 0.1)
        });

        it("should fail to repay funds as a non-owner", async () => {
            let nonOwnerWrappedLoan = WrapperBuilder
                // @ts-ignore
                .wrap(loan.connect(depositor))
                .usingSimpleNumericMock({
                    mockSignersCount: 10,
                    dataPoints: MOCK_PRICES
                });
            await expect(nonOwnerWrappedLoan.repay(toBytes32("MCKUSD"), toWei("300"))).to.be.revertedWith("DiamondStorageLib: Must be contract owner");
        });

        it("should repay funds", async () => {
            await wrappedLoan.repay(toBytes32("MCKUSD"), toWei("100"));
            await wrappedLoan.repay(toBytes32("AVAX"), toWei("0.5"));

            let debt = 200 + tokensPrices.get('AVAX')! * 0.5;
            let maxDebt = 0.833333 * (500 + tokensPrices.get('AVAX')! * 0.5);

            expect(fromWei(await tokenContracts.get('MCKUSD')!.connect(borrower).balanceOf(wrappedLoan.address))).to.be.equal(500);
            expect(fromWei(await wrappedLoan.getTotalValue())).to.be.closeTo(500 + tokensPrices.get('AVAX')! * 0.5, 1);
            expect(fromWei(await wrappedLoan.getDebt())).to.be.closeTo(200 + tokensPrices.get('AVAX')! * 0.5, 1);
            expect(fromWei(await wrappedLoan.getHealthRatio())).to.be.closeTo(maxDebt / debt, 0.1);
        });


        it("should prevent borrowing too much", async () => {
            await expect(wrappedLoan.borrow(toBytes32("AVAX"), toWei("900"))).to.be.revertedWith("The action may cause an account to become insolvent");
            expect(fromWei(await tokenContracts.get('AVAX')!.connect(borrower).balanceOf(wrappedLoan.address))).to.be.equal(0.5);
        });

        it("should repay the debt when specified too much", async () => {
            //adding little funds to account for interest
            await tokenContracts.get('AVAX')!.connect(borrower).deposit({value: toWei("0.01")});
            await tokenContracts.get('AVAX')!.connect(borrower).approve(wrappedLoan.address, toWei("0.01"));

            await wrappedLoan.fund(toBytes32("AVAX"), toWei("0.01"));
            await wrappedLoan.repay(toBytes32("AVAX"), toWei("0.6"));

            expect(fromWei(await tokenContracts.get('AVAX')!.connect(borrower).balanceOf(wrappedLoan.address))).to.be.closeTo(0.01, 0.000001);
        });
    });
});

