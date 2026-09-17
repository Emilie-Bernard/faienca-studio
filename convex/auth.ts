import GitHub from '@auth/core/providers/github';
import { convexAuth } from '@convex-dev/auth/server';
export const {auth,signIn,signOut,store,isAuthenticated} = convexAuth({
 providers:[GitHub({profile(profile){
  const githubId=String(profile.id);
  if(!process.env.OWNER_GITHUB_ID || githubId!==process.env.OWNER_GITHUB_ID) throw new Error('Compte non autorisé.');
  return {id:githubId,githubId,name:profile.name??profile.login,email:profile.email,image:profile.avatar_url};
 }})],
});
