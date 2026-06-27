from PIL import Image, ImageDraw
import os
def Hx(c): c=c.lstrip('#'); return (int(c[0:2],16),int(c[2:4],16),int(c[4:6],16),255)
OUT=Hx('#0e1218')
W,Hh=22,30
def newc(): im=Image.new('RGBA',(W,Hh),(0,0,0,0)); return im, ImageDraw.Draw(im)
def R(d,x0,y0,x1,y1,c): d.rectangle([x0,y0,x1,y1],fill=c)
def outline(im,col=OUT):
    px=im.load(); w,hh=im.size; out=im.copy(); o=out.load()
    for y in range(hh):
        for x in range(w):
            if px[x,y][3]==0:
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
                    nx,ny=x+dx,y+dy
                    if 0<=nx<w and 0<=ny<hh and px[nx,ny][3]>0: o[x,y]=col;break
    return out

P=dict(steel=Hx('#6d7888'),steeld=Hx('#4c5563'),steell=Hx('#94a2b3'),
   skin=Hx('#c89a68'),skind=Hx('#a3784c'),gold=Hx('#cf9a38'),
   blade=Hx('#cdd6e1'),bladed=Hx('#97a3b1'),
   cape=Hx('#8d3636'),caped=Hx('#5f2424'),capel=Hx('#a84a4a'),
   leg=Hx('#3c4350'),boot=Hx('#262b34'))

def warrior(direction,state,frame):
    im,d=newc()
    # phase / bob / sway
    if state=='walk':
        phase=frame%4; bob=-1 if phase in(1,3) else 0; sway=1 if phase in(0,1) else -1
    elif state=='idle':
        bob=-1 if frame==1 else 0; sway=0; phase=-1
    else: bob=0; sway=0; phase=-1
    cy=10+bob
    # cape (behind, long & flowing)
    if direction=='up':
        R(d,6,cy,15,cy+15,P['cape']); R(d,6,cy+11,15,cy+15,P['caped']); R(d,7,cy,14,cy+2,P['capel'])
    elif direction=='down':
        R(d,5,cy+1,8,cy+13+(1 if sway>0 else 0),P['cape']); R(d,13,cy+1,16,cy+13+(1 if sway<0 else 0),P['cape'])
        R(d,5,cy+10,8,cy+14,P['caped']); R(d,13,cy+10,16,cy+14,P['caped'])
    else:
        R(d,3,cy,9,cy+14,P['cape']); R(d,3,cy+10,9,cy+15,P['caped']); R(d,7,cy,9,cy+2,P['capel'])
    # legs
    if direction in('down','up'):
        if phase==0: ly,ry=22,25
        elif phase==2: ly,ry=25,22
        else: ly=ry=24
        R(d,9,19,11,ly,P['leg']); R(d,9,ly-1,11,ly,P['boot'])
        R(d,12,19,14,ry,P['leg']); R(d,12,ry-1,14,ry,P['boot'])
    else:
        if phase in(0,1): R(d,9,19,11,25,P['leg']); R(d,12,19,14,23,P['leg'])
        elif phase in(2,3): R(d,9,19,11,23,P['leg']); R(d,12,19,14,25,P['leg'])
        else: R(d,10,19,12,25,P['leg']); R(d,11,19,13,24,P['leg'])
        R(d,9,24,14,25,P['boot'])
    # torso
    ty=12+bob
    R(d,8,ty,14,ty+8,P['steel']); R(d,8,ty+6,14,ty+8,P['steeld']); R(d,8,ty+4,14,ty+5,P['gold'])
    # head
    hy=4+bob
    R(d,8,hy,14,hy+8,P['steel']); R(d,8,hy,14,hy+1,P['steell']); R(d,10,hy-2,11,hy+1,P['cape'])
    if direction=='down':
        R(d,9,hy+3,13,hy+7,P['skin']); R(d,9,hy+6,13,hy+7,P['skind']); R(d,10,hy+4,10,hy+5,OUT); R(d,12,hy+4,12,hy+5,OUT)
    elif direction=='up':
        R(d,8,hy+3,14,hy+8,P['steeld'])
    else:
        R(d,11,hy+3,14,hy+7,P['skin']); R(d,11,hy+6,14,hy+7,P['skind']); R(d,13,hy+4,13,hy+5,OUT); R(d,8,hy+2,10,hy+8,P['steeld'])
    # weapon + shield
    atk=(state=='attack')
    if direction=='down':
        R(d,4,ty,7,ty+6,P['steeld']); R(d,4,ty,7,ty+1,P['steell']); R(d,5,ty+2,6,ty+4,P['gold'])
        if atk and frame==0: R(d,15,hy+1,17,ty+3,P['blade'])
        elif atk and frame==1: R(d,13,ty+5,20,ty+7,P['blade']); R(d,19,ty+5,20,ty+7,P['bladed'])
        elif atk: R(d,15,ty+3,17,ty+7,P['blade'])
        else: R(d,15,ty-1,17,ty+5,P['blade']); R(d,15,ty+5,17,ty+6,P['gold'])
    elif direction=='up':
        R(d,15,ty,18,ty+6,P['steeld']); R(d,15,ty,18,ty+1,P['steell'])
        if atk and frame==1: R(d,3,ty+3,9,ty+5,P['blade'])
        else: R(d,5,hy+1,7,ty+4,P['blade']); R(d,5,ty+4,7,ty+5,P['gold'])
    else:
        R(d,6,ty+1,9,ty+6,P['steeld']); R(d,6,ty+1,9,ty+2,P['steell'])
        if atk and frame==0: R(d,14,hy+2,16,ty+3,P['blade'])
        elif atk and frame==1: R(d,14,ty+3,21,ty+5,P['blade']); R(d,20,ty+3,21,ty+5,P['bladed'])
        elif atk: R(d,14,ty+4,16,ty+7,P['blade'])
        else: R(d,14,ty-1,16,ty+6,P['blade']); R(d,14,ty+6,16,ty+7,P['gold'])
    return outline(im)

FC={'idle':2,'walk':4,'attack':3}
OUTDIR="/home/claude/mithralda/assets/class"; os.makedirs(OUTDIR,exist_ok=True)
def build(cls,fn):
    for dirn in('down','up','side'):
        for st,n in FC.items():
            strip=Image.new('RGBA',(W*n,Hh))
            for f in range(n): strip.alpha_composite(fn(dirn,st,f),(f*W,0))
            strip.save(f"{OUTDIR}/{cls}_{st}_{dirn}.png")
build('warrior',warrior)
print("warrior strips built")
# preview: walk cycle down + side, attack down
sc=5; rows=[('down','walk',4),('side','walk',4),('up','walk',4),('down','attack',3),('side','idle',2)]
sheet=Image.new('RGBA',(6*(W*sc+6), len(rows)*(Hh*sc+8)+4),(40,40,46,255)); dr=ImageDraw.Draw(sheet)
for ri,(dirn,st,n) in enumerate(rows):
    y=4+ri*(Hh*sc+8)
    for f in range(n):
        sp=warrior(dirn,st,f).resize((W*sc,Hh*sc),Image.NEAREST); sheet.alpha_composite(sp,(6+f*(W*sc+6),y))
    dr.text((6,y),f"{dirn}/{st}",fill=(230,222,206,255))
sheet.save('/home/claude/chibi/_warrior_anim.png'); print("preview saved",sheet.size)
