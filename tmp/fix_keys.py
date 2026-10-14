with open('src/components/DesignApprovalModal.tsx', 'r') as f:
    content = f.read()

old1 = '''                                 {participatingOwners.map(owner => (
                                   <td key={owner} className="p-3 border-r border-slate-800 font-black text-center" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>'''

new1 = '''                                 {participatingOwners.map(owner => (
                                   <td key={`${r.id}-${owner}`} className="p-3 border-r border-slate-800 font-black text-center" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>'''

old2 = '''                                               return (
                                                 <td key={owner} className="p-2 border-r border-slate-800 font-black" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>'''

new2 = '''                                               return (
                                                 <td key={`${enc.id || idx}-${owner}`} className="p-2 border-r border-slate-800 font-black" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>'''

old3 = '''                                     return (
                                       <tr key={row.owner}>'''

new3 = '''                                     return (
                                       <tr key={`${routeSched.id || rIdx}-${row.owner}`}>'''

old4 = '''                                       return (
                                         <td key={owner} className="p-2 border-r border-slate-800 font-bold" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>'''

new4 = '''                                       return (
                                         <td key={`${enc.id || idx}-${owner}`} className="p-2 border-r border-slate-800 font-bold" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>'''

assert old1 in content, 'old1 not found'
assert old2 in content, 'old2 not found'
assert old3 in content, 'old3 not found'
assert old4 in content, 'old4 not found'

content = content.replace(old1, new1, 1)
content = content.replace(old2, new2, 1)
content = content.replace(old3, new3, 1)
content = content.replace(old4, new4, 1)

with open('src/components/DesignApprovalModal.tsx', 'w') as f:
    f.write(content)

print('Successfully updated keys!')
