import {ethers, waffle} from 'hardhat'
import chai, {expect} from 'chai'
import {solidity} from "ethereum-waffle";

import PoolArtifact from '../../artifacts/contracts/Pool.sol/Pool.json';
import MockTokenArtifact from "../../artifacts/contracts/mock/MockToken.sol/MockToken.json";
import VariableUtilisationRatesCalculatorArtifact
    from '../../artifacts/contracts/VariableUtilisationRatesCalculator.sol/VariableUtilisationRatesCalculator.json';
import LinearIndexArtifact from '../../artifacts/contracts/LinearIndex.sol/LinearIndex.json';
import OpenBorrowersRegistryArtifact
    from '../../artifacts/contracts/mock/OpenBorrowersRegistry.sol/OpenBorrowersRegistry.json';
import MockBorrowersRegistryArtifact
    from '../../artifacts/contracts/mock/MockBorrowersRegistry.sol/MockBorrowersRegistry.json';
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {fromWei, getFixedGasSigners, time, toWei} from "../_helpers";
import {LinearIndex, MockToken, OpenBorrowersRegistry, Pool, VariableUtilisationRatesCalculator, MockBorrowersRegistry} from "../../typechain";
import {Contract} from "ethers";

chai.use(solidity);

const {deployContract} = waffle;
const ZERO = ethers.constants.AddressZero;

describe('Pool with variable utilisation interest rates', () => {
    describe('Single borrowing with interest rates', () => {
        let sut: Pool,
            owner: SignerWithAddress,
            depositor: SignerWithAddress,
            mockToken: Contract,
            VariableUtilisationRatesCalculator: VariableUtilisationRatesCalculator;

        before("Deploy Pool contract", async () => {
            [owner, depositor] = await getFixedGasSigners(10000000);
            sut = (await deployContract(owner, PoolArtifact)) as Pool;

            mockToken = (await deployContract(owner, MockTokenArtifact, [[depositor.address, owner.address]])) as MockToken;

            VariableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
            const borrowersRegistry = (await deployContract(owner, OpenBorrowersRegistryArtifact)) as OpenBorrowersRegistry;
            const depositIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
            await depositIndex.initialize(sut.address);
            const borrowingIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
            await borrowingIndex.initialize(sut.address);

            await sut.initialize(
                VariableUtilisationRatesCalculator.address,
                borrowersRegistry.address,
                depositIndex.address,
                borrowingIndex.address,
                mockToken.address,
                ZERO
            );

            await mockToken.connect(depositor).approve(sut.address, toWei("2.0"));
            await sut.connect(depositor).deposit(toWei("2.0"));
        });

        it("should borrow", async () => {
            await sut.borrow(toWei("1.0"));
            expect(await mockToken.balanceOf(sut.address)).to.be.equal(toWei("1", "ether"));

            let borrowed = fromWei(await sut.getBorrowed(owner.address));
            expect(borrowed).to.be.closeTo(1.000000, 0.000001);
        });

        it("should keep the loan for 1 year", async () => {
            await time.increase(time.duration.years(1));

            let borrowed = fromWei(await sut.getBorrowed(owner.address));
            expect(borrowed).to.be.closeTo(1.03, 0.000001);
        });

        it("should repay", async () => {
            await mockToken.connect(owner).approve(sut.address, toWei("1.03"));
            await sut.repay(toWei("1.03"));

            let borrowed = fromWei(await sut.getBorrowed(owner.address));
            expect(borrowed).to.be.closeTo(0, 0.000001);
        });
    });

    describe('Single borrowing after a delay', () => {
        let sut: Pool,
            owner: SignerWithAddress,
            depositor: SignerWithAddress,
            borrower: SignerWithAddress,
            mockToken: Contract,
            VariableUtilisationRatesCalculator: VariableUtilisationRatesCalculator;

        before("Deploy Pool contract", async () => {
            [owner, depositor, borrower] = await getFixedGasSigners(10000000);
            sut = (await deployContract(owner, PoolArtifact)) as Pool;

            mockToken = (await deployContract(owner, MockTokenArtifact, [[depositor.address, borrower.address]])) as MockToken;

            VariableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
            const borrowersRegistry = (await deployContract(owner, OpenBorrowersRegistryArtifact)) as OpenBorrowersRegistry;
            const depositIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
            await depositIndex.initialize(sut.address);
            const borrowingIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
            await borrowingIndex.initialize(sut.address);

            await sut.initialize(
                VariableUtilisationRatesCalculator.address,
                borrowersRegistry.address,
                depositIndex.address,
                borrowingIndex.address,
                mockToken.address,
                ZERO
            );

            await mockToken.connect(depositor).approve(sut.address, toWei("2.0"));
            await sut.connect(depositor).deposit(toWei("2.0"));
        });

        it("should wait for 1 year", async () => {
            await time.increase(time.duration.years(1));

            let borrowed = fromWei(await sut.getBorrowed(borrower.address));
            expect(borrowed).to.be.closeTo(0, 0.000001);
        });

        it("should borrow", async () => {
            await sut.connect(borrower).borrow(toWei("1.0"));
            expect(await mockToken.balanceOf(sut.address)).to.be.equal(toWei("1", "ether"));

            let borrowed = fromWei(await sut.getBorrowed(borrower.address));
            expect(borrowed).to.be.closeTo(1.000000, 0.000001);
        });

        it("should keep the loan for 1 year", async () => {
            await time.increase(time.duration.years(1));

            let borrowed = fromWei(await sut.getBorrowed(borrower.address));
            expect(borrowed).to.be.closeTo(1.03, 0.000001);
        });

        it("should repay", async () => {
            await mockToken.connect(borrower).approve(sut.address, toWei("1.03"));
            await sut.connect(borrower).repay(toWei("1.03"));

            let borrowed = fromWei(await sut.getBorrowed(borrower.address));
            expect(borrowed).to.be.closeTo(0, 0.000001);
        });
    });

    describe('Borrowing close to pool utilisation threshold', () => {
        let sut: Pool,
            owner: SignerWithAddress,
            depositor: SignerWithAddress,
            borrower: SignerWithAddress,
            mockToken: Contract,
            VariableUtilisationRatesCalculator;

        before("Deploy Pool contract", async () => {
            [owner, depositor, borrower] = await getFixedGasSigners(10000000);
            VariableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
            sut = (await deployContract(owner, PoolArtifact)) as Pool;

            mockToken = (await deployContract(owner, MockTokenArtifact, [[depositor.address, borrower.address]])) as MockToken;

            const borrowersRegistry = (await deployContract(owner, OpenBorrowersRegistryArtifact)) as OpenBorrowersRegistry;
            const depositIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
            await depositIndex.initialize(sut.address);
            const borrowingIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
            await borrowingIndex.initialize(sut.address);

            await sut.initialize(
                VariableUtilisationRatesCalculator.address,
                borrowersRegistry.address,
                depositIndex.address,
                borrowingIndex.address,
                mockToken.address,
                ZERO
            );

            await mockToken.connect(depositor).approve(sut.address, toWei("2.0"));
            await sut.connect(depositor).deposit(toWei("1.0"));
        });

        it("should be able to borrow at threshold", async () => {
            await sut.connect(borrower).borrow(toWei("0.95"));

            let borrowed = fromWei(await sut.getBorrowed(borrower.address));
            expect(borrowed).to.be.closeTo(0.95, 0.000001);
        });

        it("should not be able to borrow above threshold", async () => {
            await expect(sut.connect(borrower).borrow(toWei("0.01"))).to.be.revertedWith("The pool utilisation cannot be greater than 95%");

            let borrowed = fromWei(await sut.getBorrowed(borrower.address));
            expect(borrowed).to.be.closeTo(0.95, 0.000001);
        });
    });

    describe('Borrowing access', () => {
        let sut: Pool,
            owner: SignerWithAddress,
            depositor: SignerWithAddress,
            nonRegistered: SignerWithAddress,
            registered: SignerWithAddress,
            borrower: SignerWithAddress,
            mockToken: Contract,
            borrowersRegistry: Contract,
            VariableUtilisationRatesCalculator: VariableUtilisationRatesCalculator;

        before("Deploy Pool contract", async () => {
            [owner, depositor, borrower, nonRegistered, registered] = await getFixedGasSigners(10000000);
            sut = (await deployContract(owner, PoolArtifact)) as Pool;

            mockToken = (await deployContract(owner, MockTokenArtifact, [[depositor.address, owner.address]])) as MockToken;

            VariableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
            borrowersRegistry = (await deployContract(owner, MockBorrowersRegistryArtifact)) as MockBorrowersRegistry;
            const depositIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
            await depositIndex.initialize(sut.address);
            const borrowingIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
            await borrowingIndex.initialize(sut.address);

            await sut.initialize(
                VariableUtilisationRatesCalculator.address,
                borrowersRegistry.address,
                depositIndex.address,
                borrowingIndex.address,
                mockToken.address,
                ethers.constants.AddressZero
            );

            await mockToken.connect(depositor).approve(sut.address, toWei("2.0"));
            await sut.connect(depositor).deposit(toWei("2.0"));
        });

        it("should not allow non registered account to borrow", async () => {
            await expect(sut.connect(nonRegistered).borrow(toWei("1.0"))).to.be.revertedWith('Only authorized accounts may borrow');
        });

        it("should allow registered account to borrow", async () => {
            expect(await mockToken.connect(registered).balanceOf(registered.address)).to.equal("0");
            await expect(sut.connect(nonRegistered).borrow(toWei("1.0"))).to.be.revertedWith('Only authorized accounts may borrow');
            await expect(sut.connect(registered).borrow(toWei("1.0"))).to.be.revertedWith('Only authorized accounts may borrow');
            await expect(sut.connect(borrower).borrow(toWei("1.0"))).to.be.revertedWith('Only authorized accounts may borrow');

            await borrowersRegistry.connect(owner).updateRegistry(registered.address, borrower.address);

            await expect(sut.connect(borrower).borrow(toWei("1.0"))).to.be.revertedWith('Only authorized accounts may borrow');
            await expect(sut.connect(registered).borrow(toWei("1.0"))).not.to.be.reverted;

            expect(fromWei(await mockToken.connect(registered).balanceOf(registered.address))).to.equal(1);
        });
    });
});
