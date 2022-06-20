import {ethers, waffle} from 'hardhat';
import chai from 'chai';
import {BigNumber, Contract} from 'ethers';
import {solidity} from "ethereum-waffle";

import MockUsdArtifact from "../../artifacts/contracts/mock/MockUsd.sol/MockUsd.json";
import PangolinExchangeArtifact from '../../artifacts/contracts/PangolinExchange.sol/PangolinExchange.json';
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {MockUsd, PangolinExchange} from '../../typechain';
import {Asset, fromBytes32, getFixedGasSigners, toBytes32, toWei, syncTime, fromWei, formatUnits} from "../_helpers";
import {parseUnits} from "ethers/lib/utils";

chai.use(solidity);

const {deployContract, provider} = waffle;
const {expect} = chai;

const pangolinRouterAddress = '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106';
const usdTokenAddress = '0xc7198437980c041c805A1EDcbA50c1Ce5db95118';
const WAVAXTokenAddress = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';

const ERC20Abi = [
  'function decimals() public view returns (uint8)',
  'function balanceOf(address _owner) public view returns (uint256 balance)',
  'function approve(address _spender, uint256 _value) public returns (bool success)',
  'function transfer(address _to, uint256 _value) public returns (bool success)',
  'function transferFrom(address _from, address _to, uint256 _value) public returns (bool success)'
]

const WavaxAbi = [
  'function deposit() public payable',
  ...ERC20Abi
]

const pangolinRouterAbi = [
  'function getAmountsIn (uint256 amountOut, address[] path) view returns (uint256[])',
  'function getAmountsOut (uint256 amountIn, address[] path) view returns (uint256[])'
]


describe('EPangolinExchange', () => {
  before("Synchronize blockchain time", async () => {
    await syncTime();
  });

  describe('Test buying and selling an asset', () => {
    let sut: PangolinExchange,
      wavaxToken: Contract,
      usdToken: Contract,
      pangolinRouter: Contract,
      owner: SignerWithAddress,
      usdTokenDecimalPlaces: BigNumber;

        before('Deploy the PangolinExchange contract', async () => {
      [,owner] = await getFixedGasSigners(10000000);

      sut = await deployContract(owner, PangolinExchangeArtifact) as PangolinExchange;
      await sut.initialize(pangolinRouterAddress,  [
        new Asset(toBytes32("AVAX"), WAVAXTokenAddress),
        new Asset(toBytes32("USD"), usdTokenAddress),
      ]);

      wavaxToken = new ethers.Contract(WAVAXTokenAddress, WavaxAbi, provider);
      usdToken = new ethers.Contract(usdTokenAddress, ERC20Abi, provider);
      usdTokenDecimalPlaces = await usdToken.decimals();
      pangolinRouter = await new ethers.Contract(pangolinRouterAddress, pangolinRouterAbi);

      await wavaxToken.connect(owner).deposit({value: toWei("1000")});
    });


    it('should check for the amount of tokens to swap to be greater than 0', async () => {
      await wavaxToken.connect(owner).approve(sut.address, parseUnits("1", usdTokenDecimalPlaces));
      await wavaxToken.connect(owner).transfer(sut.address, parseUnits("1", usdTokenDecimalPlaces));
      await expect(sut.swap(toBytes32('USD'), toBytes32('AVAX'), 0, 1)).to.be.revertedWith('Amount of tokens to sell has to be greater than 0');
    });


    it('should check if enough funds were provided', async () => {
      const usdTokenPurchaseAmount = 1e8;
      const estimatedAvax = (await pangolinRouter.connect(owner).getAmountsIn(usdTokenPurchaseAmount.toString(), [WAVAXTokenAddress, usdTokenAddress]))[0];

      await expect(sut.swap(toBytes32('AVAX'), toBytes32('USD'), Math.floor(estimatedAvax * 0.9).toString(), usdTokenPurchaseAmount.toString())).to.be.revertedWith('Not enough funds were provided');
    });


    it('should check if an erc20 tokens were purchased successfully', async () => {
      const usdTokenPurchaseAmount = 100;
      const usdTokenPurchaseAmountWei = parseUnits(usdTokenPurchaseAmount.toString(), usdTokenDecimalPlaces);
      const estimatedAvax = (await pangolinRouter.connect(owner).getAmountsIn(usdTokenPurchaseAmountWei, [WAVAXTokenAddress, usdTokenAddress]))[0];

      const initialWavaxBalance = await wavaxToken.connect(owner).balanceOf(owner.address);
      const initialUsdBalance = await usdToken.connect(owner).balanceOf(owner.address);

      await wavaxToken.connect(owner).transfer(sut.address, estimatedAvax);

      await sut.connect(owner).swap(toBytes32('AVAX'), toBytes32('USD'), estimatedAvax, usdTokenPurchaseAmountWei);

      const currentUsdTokenBalance = await usdToken.connect(owner).balanceOf(owner.address);
      const currentWavaxBalance = await wavaxToken.connect(owner).balanceOf(owner.address);

      expect(fromWei(currentUsdTokenBalance.sub(initialUsdBalance))).to.be.closeTo(usdTokenPurchaseAmount / 10**18, 100);
      expect(currentWavaxBalance).to.be.lte(initialWavaxBalance);
    });


    it('should keep the same USD balance in case of an insufficient token balance transferred to an exchange', async () => {
      const initialusdTokenBalance = await usdToken.connect(owner).balanceOf(sut.address);

      expect(await wavaxToken.connect(owner).balanceOf(sut.address)).to.be.equal(0);
      expect(await usdToken.connect(owner).balanceOf(sut.address)).to.be.equal(0);

      const estimatedAvaxNeeded = (await pangolinRouter.connect(owner).getAmountsIn(parseUnits("100", usdTokenDecimalPlaces), [WAVAXTokenAddress, usdTokenAddress]))[0];

      await wavaxToken.connect(owner).deposit({ value: estimatedAvaxNeeded });
      await wavaxToken.connect(owner).approve(sut.address, estimatedAvaxNeeded);

      const initialWavaxBalance = await wavaxToken.connect(owner).balanceOf(owner.address);

      await expect(sut.swap(toBytes32('AVAX'), toBytes32('USD'), (estimatedAvaxNeeded * 0.9).toString(), parseUnits("100", usdTokenDecimalPlaces))).to.be.revertedWith("Not enough funds were provided");

      expect(fromWei(await wavaxToken.connect(owner).balanceOf(sut.address))).to.be.equal(0);
      expect(formatUnits(await usdToken.connect(owner).balanceOf(sut.address), usdTokenDecimalPlaces)).to.be.equal(0);

      let newUsdBalance = await usdToken.connect(owner).balanceOf(sut.address);
      expect(newUsdBalance).to.be.equal(initialusdTokenBalance);
      expect(await wavaxToken.connect(owner).balanceOf(owner.address)).to.be.gt(BigNumber.from(initialWavaxBalance.toString()).sub(BigNumber.from(estimatedAvaxNeeded.toString())))
    });

  });

  describe('Set and read assets', () => {
    let sut: PangolinExchange;

    const token1Address = '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70';
    const token2Address = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
    const token3Address = '0x5947bb275c521040051d82396192181b413227a3';

    before("deploy a contract with a predefined supported assets", async () => {
      let contract: PangolinExchange,
        owner: SignerWithAddress;

      [owner] = await getFixedGasSigners(10000000);
      let token1 = "TOKEN_1";
      sut = await deployContract(owner, PangolinExchangeArtifact) as PangolinExchange;
      await sut.initialize(pangolinRouterAddress,
        [
          new Asset(toBytes32("AVAX"), WAVAXTokenAddress),
          new Asset(toBytes32(token1), token1Address)
        ]);
    });

    it("should add asset at a contract deploy", async () => {
      await expect((fromBytes32((await sut.getAllAssets())[0])))
        .to.be.equal("AVAX");
      await expect((fromBytes32((await sut.getAllAssets())[1])))
          .to.be.equal("TOKEN_1");
    });

    it("should add new assets without changing the sequence of previous ones", async () => {
      let token2 = "TOKEN_2";

      await sut.updateAssets([new Asset(toBytes32(token2), token2Address)]);

      await expect((fromBytes32((await sut.getAllAssets())[0])))
        .to.be.equal("AVAX");

      await expect((fromBytes32((await sut.getAllAssets())[1])))
        .to.be.equal("TOKEN_1");

      await expect((fromBytes32((await sut.getAllAssets())[2])))
        .to.be.equal(token2);

      await expect((await sut.getAssetAddress(toBytes32("AVAX"))))
        .to.be.equal(WAVAXTokenAddress);

      await expect((await sut.getAssetAddress(toBytes32("TOKEN_1"))))
        .to.be.equal(token1Address);

      await expect((await sut.getAssetAddress(toBytes32(token2))))
        .to.be.equal(token2Address);
    });


    it("should correctly remove an asset", async () => {
      await sut.updateAssets([
        new Asset(toBytes32("TOKEN_1"), token1Address),
        new Asset(toBytes32("TOKEN_2"), token2Address),
        new Asset(toBytes32("TOKEN_3"), token3Address)
      ]);

      await sut.removeAssets([toBytes32("TOKEN_2")]);

      await expect((await sut.getAllAssets()).includes("TOKEN_2"))
        .to.be.false
      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1,TOKEN_3")
      await expect(sut.getAssetAddress(toBytes32("TOKEN_2")))
        .to.be.revertedWith("Asset not supported.");
    });


    it("should not add a new asset if already supported", async () => {
      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1,TOKEN_3");

      await sut.updateAssets([new Asset(toBytes32("TOKEN_1"), token1Address)]);

      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1,TOKEN_3")
    });


    it("should update asset address", async () => {
      const newToken1Address = "0xb794F5eA0ba39494cE839613fffBA74279579268";
      await sut.updateAssets([new Asset(toBytes32("TOKEN_1"), newToken1Address)]);

      await expect((await sut.getAssetAddress(toBytes32("TOKEN_1"))).toString()).to.be.equal(newToken1Address);
    });


    it("should update one token and a add new one", async () => {
      const newToken2Address = "0x06012c8cf97BEaD5deAe237070F9587f8E7A266d";
      const token4Address = "0xB155f7e2769a24f1D3E76ACdCed934950f5da410";
      await sut.updateAssets([
        new Asset(toBytes32("TOKEN_2"), newToken2Address),
        new Asset(toBytes32("TOKEN_4"), token4Address)
      ]);

      await expect((await sut.getAssetAddress(toBytes32("TOKEN_2"))).toString()).to.be.equal(newToken2Address);
      await expect((await sut.getAssetAddress(toBytes32("TOKEN_4"))).toString()).to.be.equal(token4Address);
    });


    it("should correctly remove multiple assets", async () => {
      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1,TOKEN_3,TOKEN_2,TOKEN_4")

      await sut.removeAssets([toBytes32("TOKEN_2"), toBytes32("TOKEN_3")]);

      await expect((await sut.getAllAssets()).includes("TOKEN_2"))
        .to.be.false;
      await expect((await sut.getAllAssets()).includes("TOKEN_3"))
        .to.be.false;

      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1,TOKEN_4")

      await expect(sut.getAssetAddress(toBytes32("TOKEN_2")))
        .to.be.revertedWith("Asset not supported.");
      await expect(sut.getAssetAddress(toBytes32("TOKEN_3")))
        .to.be.revertedWith("Asset not supported.");
    });


    it("should not add any assets if one of them is corrupted", async () => {
      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1,TOKEN_4")

      await expect(sut.updateAssets([
        new Asset(toBytes32(""), token1Address),
        new Asset(toBytes32("TOKEN_5"), token1Address)
      ]))
        .to.be.revertedWith("Cannot set an empty string asset.");

      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1,TOKEN_4")
    });


    it("should correctly remove assets even if some don't exist", async () => {
      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1,TOKEN_4")

      await sut.removeAssets([toBytes32("TOKEN_4"), toBytes32("TOKEN_THAT_NOT_EXISTS")]);

      await expect(((await sut.getAllAssets()).map(
        el => fromBytes32(el)
      )).join(","))
        .to.be.equal("AVAX,TOKEN_1")
    });


    it("should not set an empty string asset", async () => {
      await expect(sut.updateAssets([new Asset(toBytes32(""), token1Address)]))
        .to.be.revertedWith("Cannot set an empty string asset.");
    });


    it("should revert for a wrong format address", async () => {
      await expect(sut.updateAssets([new Asset(toBytes32("TOKEN_4"), "bad_address")]))
        .to.be.reverted;
    });


    it("should revert for a zero address", async () => {
      await expect(sut.updateAssets([new Asset(toBytes32("TOKEN_4"), "0x")]))
        .to.be.reverted;
    });


    it("should revert for a not supported asset", async () => {
      await expect(sut.getAssetAddress(toBytes32("TOKEN_NOT_DEFINED")))
        .to.be.revertedWith("Asset not supported.");
    });


    it("should deploy a contract with an empty asset array", async () => {
      let owner2: SignerWithAddress,
        sut2: PangolinExchange;

      [,owner2] = await getFixedGasSigners(10000000);

      sut2 = await deployContract(owner2, PangolinExchangeArtifact) as PangolinExchange;
      await sut2.initialize(pangolinRouterAddress, []);
      expect(await sut2.getAllAssets()).to.be.empty;
    });
  });
});
