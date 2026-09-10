from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json
root=Path(__file__).resolve().parents[1] / 'examples/prototypes'
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
for game in ['shooter','platformer','fighter']:
 out=root/game/'Images';out.mkdir(exist_ok=True);sizes={}
 def save(name,im):
  im.save(out/name);sizes[name]=list(im.size)
 for frame in range(4):
  im=Image.new('RGBA',(32,48));d=ImageDraw.Draw(im);shift=frame%2
  color='#74e8b8' if frame<2 else '#f3ac66'
  d.rectangle((8,4+shift,24,20+shift),fill=color);d.rectangle((12,9+shift,27,13+shift),fill='#eafaff');d.rectangle((8,22,24,36),fill=color);d.rectangle((5,24,8,34),fill='#408bb0');d.rectangle((24,24,29,29),fill=color);d.rectangle((9,37,14,45-shift*3),fill='#cce7f7');d.rectangle((20,37,25,42+shift*3),fill='#cce7f7');save(f'Actor-{frame}.png',im)
 im=Image.new('RGBA',(32,32));d=ImageDraw.Draw(im);d.polygon([(0,16),(9,3),(24,3),(31,16),(24,29),(9,29)],fill='#ff827e');d.rectangle((4,12,24,18),fill='#243645');d.rectangle((7,13,10,17),fill='#fff5d5');save('Enemy.png',im)
 im=Image.new('RGBA',(32,24),'#2b5262');d=ImageDraw.Draw(im);d.rectangle((0,0,31,5),fill='#82bca9');d.line((0,14,32,14),fill='#183442',width=2);save('Platform.png',im)
 im=Image.new('RGBA',(18,18));d=ImageDraw.Draw(im);d.ellipse((1,1,17,17),fill='#ffffff');d.ellipse((5,4,13,14),fill='#b38a40');save('Coin.png',im)
 im=Image.new('RGBA',(20,36));d=ImageDraw.Draw(im);d.rectangle((3,2,5,35),fill='white');d.polygon([(5,2),(19,2),(14,13),(5,13)],fill='white');save('Flag.png',im)
 im=Image.new('RGBA',(32,48));d=ImageDraw.Draw(im);d.rounded_rectangle((2,2,30,47),8,outline='white',width=4);save('Goal.png',im)
 im=Image.new('RGB',(800,500),'#101820');d=ImageDraw.Draw(im)
 for x in range(0,800,40):d.line((x,0,x,500),fill='#172633')
 for y in range(0,500,40):d.line((0,y,800,y),fill='#172633')
 d.rectangle((18,55,782,472),outline='#314959',width=2);save('Backdrop.png',im)
 title={'shooter':'SIGNAL PATROL   |   Move WASD   Fire Space / mouse   R restart','platformer':'LANTERN STEPS   |   A D move   Space jump   Collect 4 coins   R restart','fighter':'SPARRING ROOM   |   P1 A D Space F G   P2 arrows K L   R rematch'}[game]
 for name,text,size in [('Instructions.png',title,(760,44)),('Victory.png','PLAYER 1 WINS' if game=='fighter' else 'MISSION COMPLETE',(520,120)),('Defeat.png','PLAYER 2 WINS OR DRAW' if game=='fighter' else 'TRY AGAIN',(520,120))]:
  im=Image.new('RGBA',size,'#172633');d=ImageDraw.Draw(im);f=ImageFont.truetype(font,15 if name=='Instructions.png' else 27);d.text((size[0]/2,14 if name=='Instructions.png' else 30),text,font=f,anchor='mt',fill='#e6f2ff')
  if name!='Instructions.png':d.text((260,78),'Press R to play again',font=ImageFont.truetype(font,18),anchor='mt',fill='#f3ac66')
  save(name,im)
 (out/'sizes.json').write_text(json.dumps(sizes,indent=2))
