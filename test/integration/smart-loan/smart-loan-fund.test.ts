import {ethers, waffle} from 'hardhat'
import chai, {expect} from 'chai'
import {solidity} from "ethereum-waffle";

import SmartLoansFactoryArtifact from '../../../artifacts/contracts/SmartLoansFactory.sol/SmartLoansFactory.json';
import TokenManagerArtifact from '../../../artifacts/contracts/TokenManager.sol/TokenManager.json';
import DestructableArtifact from '../../../artifacts/contracts/mock/DestructableContract.sol/DestructableContract.json';
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {WrapperBuilder} from "@redstone-finance/evm-connector";
import {
    addMissingTokenContracts,
    Asset,
    AssetNameBalance,
    AssetNameDebt,
    AssetNamePrice,
    convertAssetsListToSupportedAssets,
    convertTokenPricesMapToMockPrices,
    deployAllFacets,
    deployPools,
    fromBytes32,
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
    DestructableContract,
    RedstoneConfigManager__factory,
    SmartLoanGigaChadInterface,
    SmartLoansFactory,
    TokenManager,
} from "../../../typechain";
import TOKEN_ADDRESSES from '../../../common/addresses/avax/token_addresses.json';
import {deployDiamond} from '../../../tools/diamond/deploy-diamond';
import {BigNumber, Contract} from "ethers";

chai.use(solidity);

const {deployContract, provider} = waffle;

describe('Smart loan', () => {
    before("Synchronize blockchain time", async () => {
        await syncTime();
    });


    describe(`Funding a loan`, () => {
        let smartLoansFactory: SmartLoansFactory,
            loan: SmartLoanGigaChadInterface,
            wrappedLoan: any,
            destructable: DestructableContract,
            owner: SignerWithAddress,
            depositor: SignerWithAddress,
            MOCK_PRICES: any,
            poolContracts: Map<string, Contract> = new Map(),
            tokenContracts: Map<string, Contract> = new Map(),
            lendingPools: Array<PoolAsset> = [],
            supportedAssets: Array<Asset>,
            tokensPrices: Map<string, number>;

        before("deploy factory, exchange, wrapped native token pool and USD pool", async () => {
            [owner, depositor] = await getFixedGasSigners(10000000);
            let assetsList = ['AVAX', 'ETH', 'MCKUSD'];
            let poolNameAirdropList: Array<PoolInitializationObject> = [
                {name: 'AVAX', airdropList: [depositor]},
                {name: 'MCKUSD', airdropList: [owner, depositor]}
            ];

            // Prepare the Destructable contract to send AVAX to a SmartLoan contract
            destructable = (await deployContract(depositor, DestructableArtifact)) as DestructableContract;
            await depositor.sendTransaction({to: destructable.address, value: toWei("21.37")});

            let redstoneConfigManager = await (new RedstoneConfigManager__factory(owner).deploy(["0xFE71e9691B9524BC932C23d0EeD5c9CE41161884"]));

            let diamondAddress = await deployDiamond();

            smartLoansFactory = await deployContract(owner, SmartLoansFactoryArtifact) as SmartLoansFactory;
            await smartLoansFactory.initialize(diamondAddress);

            await deployPools(smartLoansFactory, poolNameAirdropList, tokenContracts, poolContracts, lendingPools, owner, depositor);
            tokensPrices = await getTokensPricesMap(assetsList.filter(el => el !== 'MCKUSD'), getRedstonePrices, [{symbol: 'MCKUSD', value: 1}]);
            MOCK_PRICES = convertTokenPricesMapToMockPrices(tokensPrices);
            supportedAssets = convertAssetsListToSupportedAssets(assetsList, {MCKUSD: tokenContracts.get('MCKUSD')!.address});
            addMissingTokenContracts(tokenContracts, assetsList);

            let tokenManager = await deployContract(
                owner,
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
            await smartLoansFactory.connect(owner).createLoan();

            const loanAddress = await smartLoansFactory.getLoanForOwner(owner.address);

            loan = await ethers.getContractAt("SmartLoanGigaChadInterface", loanAddress, owner);

            wrappedLoan = WrapperBuilder
                // @ts-ignore
                .wrap(loan)
                .usingSimpleNumericMock({
                    mockSignersCount: 10,
                    dataPoints: MOCK_PRICES,
                });
        });


        it("should fund a loan", async () => {
            await tokenContracts.get('MCKUSD')!.connect(owner).approve(wrappedLoan.address, toWei("1000"));
            await wrappedLoan.fund(toBytes32("MCKUSD"), toWei("300"));

            expect(fromWei(await tokenContracts.get('MCKUSD')!.connect(owner).balanceOf(wrappedLoan.address))).to.be.equal(300);
        });

        it("should return all supported assets addresses", async () => {
            let result = await wrappedLoan.getSupportedTokensAddresses();
            expect(result[0].toLowerCase()).to.be.equal(TOKEN_ADDRESSES['AVAX'].toLowerCase());
            expect(result[1].toLowerCase()).to.be.equal(TOKEN_ADDRESSES['ETH'].toLowerCase());
            expect(result[2].toLowerCase()).to.be.equal(tokenContracts.get('MCKUSD')!.address.toLowerCase());
        });

        it("should return all assets balances", async () => {
            let result = await wrappedLoan.getAllAssetsBalances();
            let assetsNameBalance = [];
            for (const r of result) {
                assetsNameBalance.push(new AssetNameBalance(fromBytes32(r[0]), r[1]));
            }
            expect(assetsNameBalance).to.eql([
                new AssetNameBalance("AVAX", BigNumber.from("0")),
                new AssetNameBalance("ETH", BigNumber.from("0")),
                new AssetNameBalance("MCKUSD", toWei("300")),
            ])
        });

        it("should borrow, return all debts, repay", async () => {
            await wrappedLoan.borrow(toBytes32("MCKUSD"), toWei("21.37"));

            let mckusdDebt = await poolContracts.get("MCKUSD")!.getBorrowed(wrappedLoan.address);

            let result = await wrappedLoan.getDebts();
            let assetsNameDebt = [];
            for (const r of result) {
                assetsNameDebt.push(new AssetNameDebt(fromBytes32(r[0]), r[1]));
            }
            expect(assetsNameDebt).to.eql([
                new AssetNameDebt("AVAX", BigNumber.from("0")),
                new AssetNameDebt("MCKUSD", mckusdDebt),
            ])

            await wrappedLoan.repay(toBytes32("MCKUSD"), toWei("100"));

            result = await wrappedLoan.getDebts();
            assetsNameDebt = [];
            for (const r of result) {
                assetsNameDebt.push(new AssetNameDebt(fromBytes32(r[0]), r[1]));
            }
            expect(assetsNameDebt).to.eql([
                new AssetNameDebt("AVAX", toWei("0")),
                new AssetNameDebt("MCKUSD", toWei("0")),
            ])
        });

        it("should return all assets prices", async () => {
            let result = await wrappedLoan.getAllAssetsPrices();
            let assetsNamePrice = [];
            for (const r of result) {
                assetsNamePrice.push(new AssetNamePrice(fromBytes32(r[0]), r[1]));
            }
            expect(assetsNamePrice).to.eql([
                new AssetNamePrice("AVAX", BigNumber.from((Math.floor(Number(tokensPrices.get('AVAX')!) * 1e8)).toString())),
                new AssetNamePrice("ETH", BigNumber.from(Math.floor((Number(tokensPrices.get('ETH')!) * 1e8)).toString())),
                new AssetNamePrice("MCKUSD", BigNumber.from(Math.floor((Number(tokensPrices.get('MCKUSD')!) * 1e8)).toString())),
            ])
        });

        it("should add native AVAX to SmartLoan using the destructable contract", async () => {
            expect(await provider.getBalance(wrappedLoan.address)).to.be.equal(0);
            await destructable.connect(depositor).destruct(wrappedLoan.address);
            expect(await provider.getBalance(wrappedLoan.address)).to.be.equal(toWei("21.37"));
        });

        it("should fail to wrapNativeToken as a non-owner", async () => {
            let nonOwnerWrappedLoan = WrapperBuilder
                // @ts-ignore
                .wrap(loan.connect(depositor))
                .usingSimpleNumericMock({
                    mockSignersCount: 10,
                    dataPoints: MOCK_PRICES,
                });
            await expect(nonOwnerWrappedLoan.wrapNativeToken(toWei("21.37"))).to.be.revertedWith("DiamondStorageLib: Must be contract owner");
        });

        it("should wrapNativeToken and then withdraw extra supplied AVAX afterwards", async () => {
            let initialWAVAXBalance = await tokenContracts.get('AVAX')!.balanceOf(wrappedLoan.address);
            await wrappedLoan.wrapNativeToken(toWei("21.37"));
            expect(await tokenContracts.get('AVAX')!.balanceOf(wrappedLoan.address)).to.be.equal(initialWAVAXBalance + toWei("21.37"));
            await wrappedLoan.withdraw(toBytes32("AVAX"), toWei("21.37"));
            expect(await tokenContracts.get('AVAX')!.balanceOf(wrappedLoan.address)).to.be.equal(initialWAVAXBalance);
        });

        it("should deposit native token", async () => {
            await wrappedLoan.depositNativeToken({value: toWei("10")});

            expect(fromWei(await provider.getBalance(wrappedLoan.address))).to.be.equal(0);
            expect(fromWei(await tokenContracts.get('AVAX')!.balanceOf(wrappedLoan.address))).to.be.equal(10);
        });

        it("should receive native token", async () => {
            const tx = await owner.sendTransaction({
                to: wrappedLoan.address,
                value: toWei("10")
            });

            await tx.wait();

            expect(fromWei(await provider.getBalance(wrappedLoan.address))).to.be.equal(10);
            expect(fromWei(await tokenContracts.get('AVAX')!.balanceOf(wrappedLoan.address))).to.be.equal(10);
        });

        it("should revert withdrawing too much native token", async () => {
            await expect(wrappedLoan.unwrapAndWithdraw(toWei("30"))).to.be.revertedWith("Not enough native token to unwrap and withdraw");
        });

        it("should fail to withdraw funds as a non-owner", async () => {
            let nonOwnerWrappedLoan = WrapperBuilder
                // @ts-ignore
                .wrap(loan.connect(depositor))
                .usingSimpleNumericMock({
                    mockSignersCount: 10,
                    dataPoints: MOCK_PRICES,
                });
            await expect(nonOwnerWrappedLoan.withdraw(toBytes32("AVAX"), toWei("300"))).to.be.revertedWith("DiamondStorageLib: Must be contract owner");
        });

        it("should withdraw native token", async () => {
            let providerBalance = fromWei(await provider.getBalance(owner.address));
            await wrappedLoan.unwrapAndWithdraw(toWei("5"));

            expect(fromWei(await provider.getBalance(owner.address))).to.be.closeTo(providerBalance + 5, 0.1);
            //shouldn't change balance of loan
            expect(fromWei(await provider.getBalance(wrappedLoan.address))).to.be.equal(10);
            expect(fromWei(await tokenContracts.get('AVAX')!.balanceOf(wrappedLoan.address))).to.be.equal(5);
        });
    });
});

