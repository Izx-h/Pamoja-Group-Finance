# Kenya payments, custody, and regulatory constraints

**Research checked 17 November 2026.** This is product-design research, not legal advice, merchant pre-approval, or a determination that any particular chama, SACCO, lender, merchant, or platform is authorized.

## Paystack capabilities are account- and approval-dependent

Paystack's Kenya onboarding distinguishes Starter and Registered businesses. Starter accounts have a KES 600,000 lifetime collection limit and cannot use Transfers. Registered businesses may use Transfers after activation and compliance review. Financial-services categories may require registered-entity documentation, but a category appearing in Paystack's supported-business list is not approval for a specific money flow. Before live use, the actual merchant must be onboarded and Paystack should confirm in writing that it accepts the platform's complete contribution, member-allocation, savings, lending, and payout model. [1] [2] [3]

Paystack documents M-Pesa collection for Kenya. Its standard customer flow is asynchronous and must be handled through webhook and independent transaction verification, not a browser-return signal. Paystack currently publishes a KES 150,000 M-Pesa payment ceiling and says recurring payments are unavailable on that channel. Safaricom publishes a general KES 250,000 per-transaction limit; until Paystack confirms a higher account-specific limit, use the lower Paystack ceiling. [4] [5] [6]

Paystack documents Pesalink as an inbound bank-payment option for Kenyan registered businesses, but says merchants must contact support to enable it. The temporary account is valid for 25 minutes and DTB customer accounts are not supported for this flow. Do not infer that Paystack's products restricted to Nigeria, Ghana, or South Africa are enabled in Kenya because a similarly named generic API field exists. [4] [7]

Incoming collection, merchant settlement, split allocation, and outgoing member transfers are distinct capabilities. Paystack's public Kenya materials differ on whether M-Pesa is available as the merchant settlement destination for all business types and on the settlement interval. Verify the actual Dashboard configuration, payout destination, account-name rules, limits, fees, and schedule for the onboarded business before relying on them. [8] [9]

Outgoing Transfers are restricted to Registered Businesses with sufficient Paystack Balance. Paystack publishes per-transfer limits of KES 10–250,000 for an M-Pesa customer wallet and KES 10–50,000,000 for Kenyan bank, Paybill, and Till destinations; actual account limits may be lower. Transfer statuses can remain pending or fail, reverse, block, reject, or expire, so settlement must be driven by verified final provider state. A Paybill requires an account reference. Manual Payouts to Paystack Balance are a separate, approval-dependent merchant settlement option; they do not create a member wallet or escrow service. [10] [11] [12]

Paystack supports split-payment allocation for settlement to subaccounts, but the documentation describes transaction allocation, not a group savings account, a safeguarded member balance, or conditional escrow. Paystack's policy lists escrow among registered-only business categories while also calling buyer–seller conditional fund holding an unsupported use. This policy tension should be resolved in writing with Paystack before designing any escrow-like workflow. [3] [13] [14]

## Custody and the product ledger

Do not market Paystack as holding a chama's pooled funds in escrow. A payment-service provider's statutory trust-fund obligations are not proof that this platform has a customer-controlled escrow account or that Paystack has agreed to release funds based on the group's approval conditions. Likewise, a local ledger balance or payment instruction does not mean funds are held, settled, safeguarded, or withdrawable. [14] [15]

The MVP therefore separates: (1) verified funds held by an identified external custodian; (2) internal accounting allocations; (3) pending payment instructions; and (4) unsettled provider receivables. Only verified external balances count as cash available for payout. No seeded demo balance or mocked provider result is presented as a real transaction. Where a test adapter is used, it is labelled test-only and cannot claim actual custody or successful movement.

## Kenyan regulatory classification

SACCO regulation depends on the legal entity and activity. Deposit-taking SACCO business requires registration under the cooperative framework and a valid SASRA licence. Specified non-deposit-taking SACCO activity is also subject to SASRA authorization; SASRA describes digital/electronic savings mobilization among relevant cases. A community-group registration or use of the word “chama” is not itself a SACCO licence or permission to take public deposits. [16] [17] [18]

The National Payment System Act restricts conducting payment-service-provider business without CBK authorization. Whether a platform is only providing software or is itself accepting, storing, routing, or executing payments depends on the actual flow and legal roles. The CBK's authorized-PSP directory should be checked against the relevant provider and current date; the directory located for this research is dated 6 November 2025. [15] [19]

The Central Bank of Kenya (Non-Deposit Taking Credit Providers) Regulations, 2026 commenced on 29 September 2026. Their application depends on whether the credit activity is regulated under another written law and on the actual provider, funds, and loan structure. Do not assume that digital, member-based, or rotating lending is exempt. Assess the business model and any transition, registration, or licensing obligations with Kenyan counsel and CBK before offering credit. [20]

Financial-services personal-data processing can trigger mandatory registration of the relevant data controller/processor with ODPC. Registration status depends on the entity and activity. Regardless of registration exemption, applicable Data Protection Act duties remain, including lawful and transparent processing, purpose limitation, security, data-subject rights, processor controls, and high-risk DPIA analysis where required. [21] [22]

## Implementation boundary

The implementation provides group administration, obligation tracking, a provider interface, audit records, and an internal double-entry ledger. It must not imply that the software is a regulated SACCO, payment service, lender, custodian, or escrow provider. Paystack live payments and payouts remain disabled until the actual account is activated, the method is explicitly enabled, a protected test key is configured for sandbox verification, the business use case is accepted, and legal/regulatory approvals appropriate to the chosen structure are established.

## References

[1]: https://support.paystack.com/en/articles/2128898 "Paystack business types"
[2]: https://support.paystack.com/en/articles/2123906 "Compliance requirements for Kenya"
[3]: https://support.paystack.com/en/articles/2129730 "Supported businesses"
[4]: https://paystack.com/docs/payments/payment-channels/ "Paystack payment channels"
[5]: https://support.paystack.com/en/articles/2128322 "Pay with M-PESA"
[6]: https://www.safaricom.co.ke/personal/m-pesa/mpesa-charges "Safaricom M-PESA charges and limits"
[7]: https://paystack.com/blog/product-engineering/pay-with-pesalink-is-now-live-in-kenya "Pay with Pesalink is now live in Kenya"
[8]: https://support.paystack.com/en/articles/2125314 "Getting your money"
[9]: https://support.paystack.com/en/articles/2123586 "Automated payouts"
[10]: https://support.paystack.com/en/articles/2132866 "Transfers"
[11]: https://paystack.com/docs/transfers/ "Paystack Transfers documentation"
[12]: https://support.paystack.com/en/articles/2131074 "Manual payouts"
[13]: https://paystack.com/docs/payments/split-payments/ "Split Payments"
[14]: https://support.paystack.com/en/articles/2127042 "Ineligible businesses"
[15]: https://www.centralbank.go.ke/images/docs/legislation/NPSRegulations2014.pdf "National Payment System Regulations 2014"
[16]: https://kenyalaw.org/akn/ke/act/2008/14/eng@2025-06-20 "SACCO Societies Act"
[17]: https://kenyalaw.org/akn/ke/act/ln/2020/82/eng@2022-12-31 "SACCO Societies (Non-Deposit-Taking Business) Regulations 2020"
[18]: https://www.sasra.go.ke/frequently-asked-questions/ "SASRA frequently asked questions"
[19]: https://www.centralbank.go.ke/national-payments-system/ "Central Bank of Kenya National Payments System"
[20]: https://kenyalaw.org/akn/ke/act/ln/2026/191/eng@2026-09-29/source "Central Bank of Kenya (Non-Deposit Taking Credit Providers) Regulations, 2026"
[21]: https://www.odpc.go.ke/faqs/ "Office of the Data Protection Commissioner frequently asked questions"
[22]: https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31 "Data Protection Act, 2019"
