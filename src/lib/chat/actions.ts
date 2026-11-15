const requestPrefix = /^(?:hey eno[,!]? |please |(?:can|could|would|will) (?:you |i )|help me |i(?: want| need| would like|'d like) to )+/;
const openAccount = /^(?:open|add|create|set up|apply for) (?:(?:a|an|another|my|new|additional|first|second) )*(?:(?:bank |checking |savings |credit card )?accounts?|checking|savings|credit cards?)(?: for me)?$/;
const signOut = /^(?:sign[ -]?out|log[ -]?out)(?: (?:me|of (?:eno|(?:my |this |the )?account)))?$|^(?:sign|log) me out$/;

export function chatAction(prompt: string): 'open-account' | 'sign-out' | undefined {
  const request = prompt.toLowerCase()
    .replace(/’/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .replace(/(?:,)? please$/, '')
    .replace(requestPrefix, '');

  if (openAccount.test(request)) return 'open-account';
  if (signOut.test(request)) return 'sign-out';
}
