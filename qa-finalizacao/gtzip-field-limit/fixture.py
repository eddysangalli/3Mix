import zipfile
from pathlib import Path
root=Path(__file__).parent
for count in (500,501):
 xml='<Composition Width="640" Height="360">'+''.join(f'<TextBlock Name="Field{i}" Dimensions="100,20,0" Location="0,0,0" Text="QA" FontSize="12"/>' for i in range(count))+'</Composition>'
 with zipfile.ZipFile(root/f'fields-{count}.gtzip','w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('document.xml',xml)
