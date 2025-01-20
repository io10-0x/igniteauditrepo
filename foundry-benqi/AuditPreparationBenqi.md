# Contest Page Notes and queries

get core invariants for a staking protocol

There are only 4 contracts in scope so I can take all these contracts to foundry and test them there as the nsloc for this shouldnt be that high with 4 contracts

need to research if there is anything weird about using avalanche compared to eth chain

are erc777 tokens excluded? these arent rebase or fee on transfer

find out all weird quirks abour usdc and how ignite aims to support it 'explicitly' - explicit support doesnt take the 6 decimal places of USDC into account. might be able to exploit this

what are these protocols invariants ?? need to run invariant test before anything. need to define invariants for a liquid staking protocol ASAP

make sure 2.4,8 and 12 week rewards are properly calculated

their website says that users get a 5% discount on the fee. what fee ?

dont worry about how the nodes are set up. this isnt what we are testing. we are just making sure that the staking and pay as you go functionality is working as expected as that is what is in scope. they outsource the validator creation so as long as we make sure the details are sent correctly to the partner who launches the validator, that should be cool

check their test coverage and see what they havent covered

# DOCS NOTES AND QUERIES

No AVAX is required upfront for pay as you go ? so why do i have to pay 8 avax when i start ? Need to correct this in the docs as can be misleading .

there are minimal rewards for pay as you go? what are these rewards and are they correctly calculated in the code ? i am guessing they will be in this validatorrewarder contract but lets see

maybe need to know what a validator is on a high level

Stake: Users can stake a combination of AVAX and QI, with BENQI supplying the remaining AVAX needed to launch a validator. Rewards are earned proportionally based on the user’s AVAX stake. need to know and confirm what the formula for this is

pricing begins at 4 AVAX per week but users can only pay for a minimum of 2 weeks

Users simply pay the required fee (in AVAX, USDC, or QI) but in the contest scope, it says that it supports most ERC20's but this isnt the case. it only supports these 3. need to look at qi token to see if it does any weird things. also need to look at usdc.

need to ask about 500 to 1800 +10% of borrowed avax in QI what does the borrowed avax in qi mean?? people who stake can run validators that earn avax rewards based on ratio of avax against 2000 avax required. need to make sure these rewards are correctly calculated

do users get a token back that represents their staked amount ?? how do users track how much they are getting paid ??

is there functionality for if a user provides the wrong node details ? are there checks to make sure node details are accurate ?
