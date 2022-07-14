import {ethers, waffle} from "hardhat"
import chai, {expect} from "chai"
import {solidity} from "ethereum-waffle";

import VariableUtilisationRatesCalculatorArtifact
  from "../../artifacts/contracts/VariableUtilisationRatesCalculator.sol/VariableUtilisationRatesCalculator.json";
import LinearIndexArtifact from '../../artifacts/contracts/LinearIndex.sol/LinearIndex.json';

import ERC20PoolArtifact from "../../artifacts/contracts/ERC20Pool.sol/ERC20Pool.json";
import MockTokenArtifact from "../../artifacts/contracts/mock/MockToken.sol/MockToken.json";
import OpenBorrowersRegistryArtifact
  from "../../artifacts/contracts/mock/OpenBorrowersRegistry.sol/OpenBorrowersRegistry.json";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {fromWei, getFixedGasSigners, time, toWei} from "../_helpers";
import {ERC20Pool, LinearIndex, OpenBorrowersRegistry, VariableUtilisationRatesCalculator, MockToken} from "../../typechain";

chai.use(solidity);

const {deployContract} = waffle;

describe("ERC20Pool ERC20 token functions", () => {
  let sut: ERC20Pool,
    owner: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress,
    mockToken: MockToken;

  beforeEach(async () => {
    [owner, user1, user2] = await getFixedGasSigners(10000000);
    sut = (await deployContract(owner, ERC20PoolArtifact)) as ERC20Pool;

    let VariableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
    let borrowersRegistry = (await deployContract(owner, OpenBorrowersRegistryArtifact)) as OpenBorrowersRegistry;
    mockToken = (await deployContract(owner, MockTokenArtifact, [[user1.address, user2.address]])) as MockToken;

    const depositIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
    await depositIndex.initialize(sut.address);
    const borrowingIndex = (await deployContract(owner, LinearIndexArtifact)) as LinearIndex;
    await borrowingIndex.initialize(sut.address);

    await sut.initialize(
        VariableUtilisationRatesCalculator.address,
        borrowersRegistry.address,
        depositIndex.address,
        borrowingIndex.address,
        mockToken.address
    );
  });

  describe("transfer", () => {

    it("should deposit and withdraw", async () => {
      const depositValue = toWei("1.0");
      await mockToken.connect(user1).approve(sut.address, depositValue);
      await sut.connect(user1).deposit(depositValue);

      expect(fromWei(await sut.balanceOf(user1.address))).to.be.equal(fromWei(depositValue));
      expect(fromWei(await mockToken.balanceOf(sut.address))).to.be.equal(fromWei(depositValue));

      const withdrawValue = toWei("0.3");
      await sut.connect(user1).withdraw(withdrawValue);

      expect(fromWei(await sut.balanceOf(user1.address))).to.be.equal(0.7);
    });

    it("should borrow and repay", async () => {
      const depositValue = toWei("1.0");
      await mockToken.connect(user1).approve(sut.address, depositValue);
      await sut.connect(user1).deposit(depositValue);
      await sut.connect(user2).borrow(toWei(".2"));
      expect(fromWei(await mockToken.balanceOf(sut.address))).to.be.equal(.8);

      expect(fromWei(await sut.borrowed(user2.address))).to.be.equal(0.2);
      expect(fromWei(await mockToken.balanceOf(sut.address))).to.be.equal(0.8);

      const repayValue = toWei("0.1");
      await mockToken.connect(user2).approve(sut.address, repayValue);
      await sut.connect(user2).repay(repayValue);
      expect(fromWei(await sut.borrowed(user2.address))).to.be.closeTo(0.1, 0.000001);
    });

    it("should accumulate interest for one year", async () => {
      const depositValue = toWei("0.5");
      await mockToken.connect(user1).approve(sut.address, depositValue);
      await sut.connect(user1).deposit(depositValue);
      await sut.connect(user2).borrow(toWei("0.3"));

      await time.increase(time.duration.years(1));

      expect(fromWei(await mockToken.balanceOf(sut.address))).to.be.equal(0.2);

      expect(fromWei(await sut.balanceOf(user1.address))).to.be.closeTo( 0.5089999912853879, 0.000001);
      expect(fromWei(await sut.getBorrowed(user2.address))).to.be.closeTo(0.309, 0.000001);

      expect(fromWei(await sut.getDepositRate())).to.be.closeTo(0.02014430094445913, 0.000001);
      expect(fromWei(await sut.getBorrowingRate())).to.be.closeTo(0.03318271602877101, 0.000001);
    });
  });
});
