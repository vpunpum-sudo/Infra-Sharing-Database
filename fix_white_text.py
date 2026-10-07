import re

css = open('src/index.css').read()

pattern = r'\.light-theme div\[class\*="rounded-"\] > \.text-white:not\(\[class\*="bg-brand-"\]\):not\(\[class\*="bg-rose-"\]\):not\(\[class\*="bg-emerald-"\]\)'
replacement = r'.light-theme div[class*="rounded-"] > .text-white:not(.bg-brand-500):not(.bg-brand-600):not(.bg-rose-500):not(.bg-rose-600):not(.bg-emerald-500):not(.bg-emerald-600):not(.btn-primary)'

new_css = re.sub(pattern, replacement, css)

with open('src/index.css', 'w') as f:
    f.write(new_css)
print("Done")
