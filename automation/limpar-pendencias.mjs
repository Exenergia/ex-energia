import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mbxbvprbpbnpigybbspd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OwxrJ0N_Ra_ts_GBoH_g3g_JirT3f2B';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const limite = new Date();
  limite.setDate(limite.getDate() - 15);

  const { data, error } = await supabase
    .from('pendencias')
    .delete()
    .eq('marcado_exclusao', true)
    .lte('data_marcacao_exclusao', limite.toISOString())
    .select();

  if (error) {
    console.error('Erro ao apagar pendências:', error.message);
    process.exit(1);
  }

  console.log(`Apagadas ${data.length} pendência(s) marcadas há mais de 15 dias.`);
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
