from PIL import Image, ImageDraw
def Hx(c): c=c.lstrip('#'); return (int(c[0:2],16),int(c[2:4],16),int(c[4:6],16),255)
OUT=Hx('#0e1218')
def newc(w=22,h=30): im=Image.new('RGBA',(w,h),(0,0,0,0)); return im, ImageDraw.Draw(im)
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

def warrior(direction='down',frame=0,state='idle'):
    im,d=newc(); bob=-1 if(state=='walk' and frame==1) else 0
    sway=1 if(state=='walk' and frame==1) else (-1 if(state=='walk' and frame==0) else 0)
    cy=10+bob
    # ---- cape (behind) ----
    if direction=='up':
        R(d,6,cy,15,cy+13,P['cape']); R(d,6,cy+9,15,cy+13,P['caped']); R(d,7,cy,14,cy+2,P['capel'])
    elif direction=='down':
        R(d,5,cy+1,8,cy+12+ (sway>0),P['cape']); R(d,13,cy+1,16,cy+12-(sway>0),P['cape'])
        R(d,5,cy+9,8,cy+13,P['caped']); R(d,13,cy+9,16,cy+13,P['caped'])
    else: # side faces right, cape trails left
        R(d,3+ (sway<0),cy,9,cy+12,P['cape']); R(d,3,cy+8,9,cy+13,P['caped']); R(d,7,cy,9,cy+2,P['capel'])
    # ---- legs ----
    if direction in('down','up'):
        if state=='walk' and frame==1: ly,ry=24,22
        elif state=='walk' and frame==0: ly,ry=22,24
        else: ly=ry=24
        R(d,9,19,11,ly,P['leg']); R(d,9,ly-1,11,ly,P['boot'])
        R(d,12,19,14,ry,P['leg']); R(d,12,ry-1,14,ry,P['boot'])
    else:
        if state=='walk' and frame==1: R(d,9,19,11,25,P['leg']); R(d,12,19,14,24,P['leg'])
        else: R(d,10,19,12,25,P['leg']); R(d,11,19,13,24,P['leg'])
        R(d,9,24,14,25,P['boot'])
    # ---- torso (slimmer, taller) ----
    ty=12+bob
    R(d,8,ty,14,ty+8,P['steel']); R(d,8,ty+6,14,ty+8,P['steeld']); R(d,8,ty+4,14,ty+5,P['gold'])
    # ---- head (smaller, balanced) ----
    hy=4+bob
    R(d,8,hy,14,hy+8,P['steel']); R(d,8,hy,14,hy+1,P['steell'])
    R(d,10,hy-2,11,hy+1,P['cape'])  # small plume matches cape
    if direction=='down':
        R(d,9,hy+3,13,hy+7,P['skin']); R(d,9,hy+6,13,hy+7,P['skind'])
        R(d,10,hy+4,10,hy+5,OUT); R(d,12,hy+4,12,hy+5,OUT)
    elif direction=='up':
        R(d,8,hy+3,14,hy+8,P['steeld'])
    else:
        R(d,11,hy+3,14,hy+7,P['skin']); R(d,11,hy+6,14,hy+7,P['skind']); R(d,13,hy+4,13,hy+5,OUT)
        R(d,8,hy+2,10,hy+8,P['steeld'])
    # ---- weapon + shield ----
    atk=(state=='attack')
    if direction=='down':
        R(d,4,ty,7,ty+6,P['steeld']); R(d,4,ty,7,ty+1,P['steell']); R(d,5,ty+2,6,ty+4,P['gold']) # shield L
        if atk and frame==1: R(d,13,ty+5,19,ty+7,P['blade']); R(d,18,ty+5,19,ty+7,P['bladed'])
        elif atk: R(d,15,hy+1,17,ty+3,P['blade'])
        else: R(d,15,ty-1,17,ty+5,P['blade']); R(d,15,ty+5,17,ty+6,P['gold'])
    elif direction=='up':
        R(d,15,ty,18,ty+6,P['steeld']); R(d,15,ty,18,ty+1,P['steell'])
        if atk and frame==1: R(d,3,ty+3,9,ty+5,P['blade'])
        else: R(d,5,hy+1,7,ty+4,P['blade']); R(d,5,ty+4,7,ty+5,P['gold'])
    else:
        R(d,6,ty+1,9,ty+6,P['steeld']); R(d,6,ty+1,9,ty+2,P['steell'])  # shield back
        if atk and frame==1: R(d,14,ty+3,21,ty+5,P['blade']); R(d,20,ty+3,21,ty+5,P['bladed'])
        elif atk: R(d,14,hy+2,16,ty+3,P['blade'])
        else: R(d,14,ty-1,16,ty+6,P['blade']); R(d,14,ty+6,16,ty+7,P['gold'])
    return outline(im)

tests=[('down','idle',0),('up','idle',0),('side','idle',0),('side','walk',1),('down','walk',1),('down','attack',1),('side','attack',1)]
sc=6
sheet=Image.new('RGBA',(len(tests)*(22*sc+8),30*sc+24),(40,40,46,255)); dr=ImageDraw.Draw(sheet); x=4
for dirn,st,fr in tests:
    sp=warrior(dirn,fr,st).resize((22*sc,30*sc),Image.NEAREST); sheet.alpha_composite(sp,(x,20)); dr.text((x,4),f"{dirn}/{st}",fill=(230,222,206,255)); x+=22*sc+8
sheet.save('/home/claude/chibi/_warrior2.png'); print("saved",sheet.size)
